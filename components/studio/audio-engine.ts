import {
  getSynthRecipe,
  type AdditivePartial,
  type EnvelopeSpec,
  type FilterSpec,
  type LfoWobbleSpec,
  type SynthRecipe,
} from "@/components/studio/synth-presets"

/**
 * Hand-rolled Web Audio synthesis engine. No external audio library (no
 * Tone.js) — every graph below is built node-by-node from the primitives
 * `synth-presets.ts` describes, matching the rest of this codebase's
 * hand-rolled-math style (see rhythm.ts, staff-geometry.ts).
 *
 * One `AudioEngine` owns one `AudioContext` and one shared master
 * `GainNode`. Each `scheduleNote` call builds a fresh, self-contained
 * per-note graph (source(s) -> optional filter -> per-note envelope gain
 * -> stereo panner -> master gain -> destination) and registers it as an
 * "active voice" so `stopAll()` can panic-stop everything currently
 * sounding.
 */

export interface ScheduleNoteOptions {
  presetId: string
  /** MIDI note number; A4 = 69 = 440Hz. */
  midi: number
  /** AudioContext.currentTime-relative start time, seconds. */
  startTime: number
  /** Seconds the note is notated to sound for. */
  duration: number
  /** Per-voice volume, 0-100. */
  volume: number
  /** Per-voice pan, -50..50. */
  pan: number
  /** Master volume, 0-100. */
  masterVolume: number
}

export interface AudioEngine {
  ctx: AudioContext
  /** Must be called from within a real user-gesture handler (click). */
  resume(): Promise<void>
  scheduleNote(opts: ScheduleNoteOptions): void
  /** Panic-stop: immediately (over a few ms) silences everything currently sounding. */
  stopAll(): void
}

// ---------------------------------------------------------------------------
// Tuning / mix constants
// ---------------------------------------------------------------------------

/** Nominal per-note peak gain at volume=100, before the shared master gain. Leaves headroom for several simultaneous voices. */
const NOMINAL_PEAK = 0.3

/** Floor used in place of literal 0 for exponential ramps (which can't target 0). */
const EPSILON = 0.0001

/** Length of the shared noise buffer; it loops, so this just needs to be long enough to avoid an audible repeat cycle. */
const NOISE_BUFFER_SECONDS = 2

/** Harmonics used to build a pulse-wave PeriodicWave. Plenty for the pitch range a notated score uses. */
const PULSE_WAVE_HARMONICS = 32

/** Sample resolution of a bitcrush WaveShaper staircase curve. */
const BITCRUSH_CURVE_RESOLUTION = 1024

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// ---------------------------------------------------------------------------
// Cached graph-building primitives
// ---------------------------------------------------------------------------

/**
 * Builds a band-limited pulse-wave PeriodicWave for a given duty cycle from
 * its Fourier sine coefficients: for a pulse of duty `d`, the n-th harmonic
 * has amplitude (4 / (n*pi)) * sin(n*pi*d) — at d=0.5 this reduces to the
 * familiar odd-harmonics-only square wave series.
 */
function buildPulsePeriodicWave(ctx: AudioContext, duty: number): PeriodicWave {
  const real = new Float32Array(PULSE_WAVE_HARMONICS)
  const imag = new Float32Array(PULSE_WAVE_HARMONICS)
  for (let n = 1; n < PULSE_WAVE_HARMONICS; n++) {
    imag[n] = (4 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false })
}

const pulseWaveCache = new WeakMap<AudioContext, Map<number, PeriodicWave>>()

function getPulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  let byDuty = pulseWaveCache.get(ctx)
  if (!byDuty) {
    byDuty = new Map()
    pulseWaveCache.set(ctx, byDuty)
  }
  // Round so near-identical duty values (there aren't any today, but future
  // presets might share one) reuse the same cached wave.
  const key = Math.round(duty * 1000)
  let wave = byDuty.get(key)
  if (!wave) {
    wave = buildPulsePeriodicWave(ctx, duty)
    byDuty.set(key, wave)
  }
  return wave
}

const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>()

/** Lazily generates a shared white-noise buffer per context, reused (via a fresh AudioBufferSourceNode) by every noise-based note. */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBufferCache.get(ctx)
  if (!buffer) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS))
    buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    noiseBufferCache.set(ctx, buffer)
  }
  return buffer
}

const bitcrushCurveCache = new Map<number, Float32Array>()

/** Builds a staircase transfer curve for WaveShaperNode that quantizes input amplitude to `steps` levels. */
function getBitcrushCurve(steps: number): Float32Array {
  let curve = bitcrushCurveCache.get(steps)
  if (!curve) {
    curve = new Float32Array(BITCRUSH_CURVE_RESOLUTION)
    for (let i = 0; i < BITCRUSH_CURVE_RESOLUTION; i++) {
      const x = (i / (BITCRUSH_CURVE_RESOLUTION - 1)) * 2 - 1 // -1..1
      curve[i] = Math.round(x * steps) / steps
    }
    bitcrushCurveCache.set(steps, curve)
  }
  return curve
}

// ---------------------------------------------------------------------------
// Per-note graph building
// ---------------------------------------------------------------------------

/** Nodes with `.start()`/`.stop()`/`onended` — oscillators and buffer sources. */
type SourceNode = OscillatorNode | AudioBufferSourceNode

/** Accumulates everything a single note's graph creates, so it can all be started/stopped/disconnected together. */
interface BuildCtx {
  sources: SourceNode[]
  nodes: AudioNode[]
}

function addSource(bctx: BuildCtx, node: SourceNode): void {
  bctx.sources.push(node)
  bctx.nodes.push(node)
}

function addNode<T extends AudioNode>(bctx: BuildCtx, node: T): T {
  bctx.nodes.push(node)
  return node
}

function applyFilterChain(ctx: AudioContext, bctx: BuildCtx, spec: FilterSpec | undefined, input: AudioNode): AudioNode {
  if (!spec) return input
  const filter = ctx.createBiquadFilter()
  filter.type = spec.type
  filter.frequency.value = spec.frequency
  if (spec.q !== undefined) filter.Q.value = spec.q
  input.connect(filter)
  return addNode(bctx, filter)
}

/** Wires an LFO oscillator into `targetParam` (e.g. a source's `.detune`), scaled to `depthCents`. Web Audio sums a connected signal with the param's own scheduled value, so this composes fine with a static detune already set via setValueAtTime. */
function applyLfoWobble(ctx: AudioContext, bctx: BuildCtx, targetParam: AudioParam, spec: LfoWobbleSpec | undefined, startTime: number): void {
  if (!spec) return
  const lfoOsc = ctx.createOscillator()
  lfoOsc.type = "sine"
  lfoOsc.frequency.setValueAtTime(spec.rateHz, startTime)
  const lfoGain = ctx.createGain()
  lfoGain.gain.setValueAtTime(spec.depthCents, startTime)
  lfoOsc.connect(lfoGain)
  lfoGain.connect(targetParam)
  lfoOsc.start(startTime)
  addSource(bctx, lfoOsc)
  addNode(bctx, lfoGain)
}

function scheduleOscFrequency(osc: OscillatorNode, freq: number, sweep: { startRatio: number; ms: number } | undefined, startTime: number): void {
  if (sweep) {
    osc.frequency.setValueAtTime(freq * sweep.startRatio, startTime)
    osc.frequency.linearRampToValueAtTime(freq, startTime + sweep.ms / 1000)
  } else {
    osc.frequency.setValueAtTime(freq, startTime)
  }
}

function buildOscillatorGraph(
  ctx: AudioContext,
  bctx: BuildCtx,
  recipe: Extract<SynthRecipe, { kind: "oscillator" }>,
  freq: number,
  startTime: number,
): AudioNode {
  const voiceCount = 1 + (recipe.detuneVoices ?? 0)
  const spacing = recipe.detuneCents ?? 10
  const sum = addNode(bctx, ctx.createGain())
  sum.gain.value = voiceCount > 1 ? 1 / Math.sqrt(voiceCount) : 1
  for (let i = 0; i < voiceCount; i++) {
    const osc = ctx.createOscillator()
    osc.type = recipe.type
    const detune = voiceCount > 1 ? (i - (voiceCount - 1) / 2) * spacing : 0
    osc.detune.setValueAtTime(detune, startTime)
    scheduleOscFrequency(osc, freq, recipe.sweep, startTime)
    applyLfoWobble(ctx, bctx, osc.detune, recipe.lfoWobble, startTime)
    osc.connect(sum)
    osc.start(startTime)
    addSource(bctx, osc)
  }
  return applyFilterChain(ctx, bctx, recipe.filter, sum)
}

function buildPulseGraph(
  ctx: AudioContext,
  bctx: BuildCtx,
  recipe: Extract<SynthRecipe, { kind: "pulse" }>,
  freq: number,
  startTime: number,
): AudioNode {
  const osc = ctx.createOscillator()
  osc.setPeriodicWave(getPulseWave(ctx, recipe.duty))
  scheduleOscFrequency(osc, freq, recipe.sweep, startTime)
  applyLfoWobble(ctx, bctx, osc.detune, recipe.lfoWobble, startTime)
  osc.start(startTime)
  addSource(bctx, osc)
  return applyFilterChain(ctx, bctx, recipe.filter, osc)
}

function buildNoiseGraph(
  ctx: AudioContext,
  bctx: BuildCtx,
  recipe: Extract<SynthRecipe, { kind: "noise" }>,
  startTime: number,
): AudioNode {
  const src = ctx.createBufferSource()
  src.buffer = getNoiseBuffer(ctx)
  src.loop = true
  src.start(startTime)
  addSource(bctx, src)
  return applyFilterChain(ctx, bctx, recipe.filter, src)
}

/** 2-operator FM: modulator osc -> gain(modIndex, in Hz of peak deviation) -> carrier osc's frequency AudioParam. */
function buildFmGraph(
  ctx: AudioContext,
  bctx: BuildCtx,
  recipe: Extract<SynthRecipe, { kind: "fm" }>,
  freq: number,
  startTime: number,
): AudioNode {
  const carrier = ctx.createOscillator()
  carrier.type = "sine"
  carrier.frequency.setValueAtTime(freq * recipe.carrierRatio, startTime)

  const modulator = ctx.createOscillator()
  modulator.type = "sine"
  const modFreq = freq * recipe.modulatorRatio
  modulator.frequency.setValueAtTime(modFreq, startTime)

  const modGain = addNode(bctx, ctx.createGain())
  const peakDeviation = Math.max(recipe.modIndex * modFreq, EPSILON)
  if (recipe.modIndexAttackRamp) {
    const attackEnd = startTime + Math.max(recipe.envelope.attackMs, 1) / 1000
    modGain.gain.setValueAtTime(EPSILON, startTime)
    modGain.gain.exponentialRampToValueAtTime(peakDeviation, attackEnd)
  } else {
    modGain.gain.setValueAtTime(peakDeviation, startTime)
  }

  modulator.connect(modGain)
  modGain.connect(carrier.frequency)
  modulator.start(startTime)
  carrier.start(startTime)
  addSource(bctx, modulator)
  addSource(bctx, carrier)
  return carrier
}

/** Ring modulation: carrier -> gain node (as normal audio input), modulator -> that same gain node's `.gain` AudioParam. */
function buildRingmodGraph(
  ctx: AudioContext,
  bctx: BuildCtx,
  recipe: Extract<SynthRecipe, { kind: "ringmod" }>,
  freq: number,
  startTime: number,
): AudioNode {
  const carrier = ctx.createOscillator()
  carrier.type = recipe.carrierType
  carrier.frequency.setValueAtTime(freq, startTime)

  const modulator = ctx.createOscillator()
  modulator.type = "sine"
  modulator.frequency.setValueAtTime(freq * recipe.modulatorRatio, startTime)

  // Base gain 0: the modulator (amplitude +/-1) swings the gain param
  // through the carrier's signal, i.e. genuine amplitude/ring modulation.
  const ring = addNode(bctx, ctx.createGain())
  ring.gain.setValueAtTime(0, startTime)

  carrier.connect(ring)
  modulator.connect(ring.gain)
  carrier.start(startTime)
  modulator.start(startTime)
  addSource(bctx, carrier)
  addSource(bctx, modulator)
  return ring
}

function buildAdditiveGraph(
  ctx: AudioContext,
  bctx: BuildCtx,
  recipe: Extract<SynthRecipe, { kind: "additive" }>,
  freq: number,
  startTime: number,
): AudioNode {
  const sum = addNode(bctx, ctx.createGain())
  const partials: AdditivePartial[] = recipe.partials.length > 0 ? recipe.partials : [{ ratio: 1, gain: 1 }]
  const totalGain = partials.reduce((s, p) => s + p.gain, 0) || 1
  for (const partial of partials) {
    const osc = ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.setValueAtTime(freq * partial.ratio, startTime)
    const g = addNode(bctx, ctx.createGain())
    g.gain.value = partial.gain / totalGain
    osc.connect(g)
    g.connect(sum)
    osc.start(startTime)
    addSource(bctx, osc)
  }
  return sum
}

function buildBitcrushGraph(
  ctx: AudioContext,
  bctx: BuildCtx,
  recipe: Extract<SynthRecipe, { kind: "bitcrush" }>,
  freq: number,
  startTime: number,
): AudioNode {
  const osc = ctx.createOscillator()
  osc.type = recipe.baseType
  osc.frequency.setValueAtTime(freq, startTime)
  applyLfoWobble(ctx, bctx, osc.detune, recipe.lfoWobble, startTime)
  osc.start(startTime)
  addSource(bctx, osc)

  const shaper = addNode(bctx, ctx.createWaveShaper())
  shaper.curve = getBitcrushCurve(recipe.steps)
  shaper.oversample = "4x"
  osc.connect(shaper)

  return applyFilterChain(ctx, bctx, recipe.filter, shaper)
}

function buildSourceGraph(ctx: AudioContext, bctx: BuildCtx, recipe: SynthRecipe, freq: number, startTime: number): AudioNode {
  switch (recipe.kind) {
    case "oscillator":
      return buildOscillatorGraph(ctx, bctx, recipe, freq, startTime)
    case "pulse":
      return buildPulseGraph(ctx, bctx, recipe, freq, startTime)
    case "noise":
      return buildNoiseGraph(ctx, bctx, recipe, startTime)
    case "fm":
      return buildFmGraph(ctx, bctx, recipe, freq, startTime)
    case "ringmod":
      return buildRingmodGraph(ctx, bctx, recipe, freq, startTime)
    case "additive":
      return buildAdditiveGraph(ctx, bctx, recipe, freq, startTime)
    case "bitcrush":
      return buildBitcrushGraph(ctx, bctx, recipe, freq, startTime)
    default: {
      const exhaustive: never = recipe
      throw new Error(`Unhandled synth recipe kind: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * Schedules the per-note envelope on `gainNode.gain` and returns the
 * AudioContext time at which the note is fully silent (so callers know
 * when it's safe to stop/disconnect the sources).
 */
function scheduleEnvelope(gainNode: GainNode, envelope: EnvelopeSpec, startTime: number, duration: number, peakGain: number): number {
  const g = gainNode.gain
  const safePeak = Math.max(peakGain, EPSILON)
  const attackEnd = startTime + Math.max(envelope.attackMs, 1) / 1000

  g.cancelScheduledValues(startTime)
  g.setValueAtTime(0, startTime)
  g.linearRampToValueAtTime(safePeak, attackEnd)

  let fadeStart: number
  if (envelope.sustain) {
    // Hold at peak until the note's notated duration ends, then release.
    fadeStart = Math.max(attackEnd, startTime + duration)
    g.setValueAtTime(safePeak, fadeStart)
  } else {
    // Decay on its own (bell/pluck/percussive), independent of `duration`.
    const decayMs = envelope.decayMs ?? duration * 1000
    fadeStart = attackEnd + Math.max(decayMs, 1) / 1000
    g.exponentialRampToValueAtTime(Math.max(safePeak * 0.01, EPSILON), fadeStart)
  }

  const releaseEnd = fadeStart + Math.max(envelope.releaseMs, 1) / 1000
  g.linearRampToValueAtTime(0, releaseEnd)
  return releaseEnd
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface VoiceHandle {
  gainNode: GainNode
  sources: SourceNode[]
  nodes: AudioNode[]
}

export function createEngine(): AudioEngine {
  const ctx = new AudioContext()

  const masterGain = ctx.createGain()
  masterGain.gain.value = 1
  masterGain.connect(ctx.destination)

  /** Every note currently sounding. Entries remove themselves once their own natural stop point passes. */
  const activeVoices = new Set<VoiceHandle>()

  async function resume(): Promise<void> {
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
  }

  function scheduleNote(opts: ScheduleNoteOptions): void {
    const recipe = getSynthRecipe(opts.presetId)
    const freq = midiToFrequency(opts.midi)
    const startTime = opts.startTime

    // Master volume is a single live control shared by every voice; nudge
    // the shared node toward the latest value with a short time constant
    // so a mid-playback change doesn't zipper/click.
    masterGain.gain.setTargetAtTime(clamp(opts.masterVolume, 0, 100) / 100, ctx.currentTime, 0.01)

    const bctx: BuildCtx = { sources: [], nodes: [] }
    const output = buildSourceGraph(ctx, bctx, recipe, freq, startTime)

    const noteGain = addNode(bctx, ctx.createGain())
    noteGain.gain.value = 0
    output.connect(noteGain)

    const panner = addNode(bctx, ctx.createStereoPanner())
    panner.pan.setValueAtTime(clamp(opts.pan / 50, -1, 1), startTime)
    noteGain.connect(panner)
    panner.connect(masterGain)

    const peakGain = NOMINAL_PEAK * (clamp(opts.volume, 0, 100) / 100)
    const stopAt = scheduleEnvelope(noteGain, recipe.envelope, startTime, Math.max(opts.duration, 0), peakGain)

    const handle: VoiceHandle = { gainNode: noteGain, sources: bctx.sources, nodes: bctx.nodes }
    activeVoices.add(handle)

    let cleanedUp = false
    const cleanup = () => {
      if (cleanedUp) return
      cleanedUp = true
      activeVoices.delete(handle)
      for (const node of bctx.nodes) {
        try {
          node.disconnect()
        } catch {
          // Already disconnected; nothing to do.
        }
      }
    }

    for (const src of bctx.sources) {
      src.onended = cleanup
      try {
        src.stop(stopAt + 0.02)
      } catch {
        // Some engines throw if stop() races an already-ended source; the
        // source has (or will) fire `onended` regardless, so cleanup still runs.
      }
    }
    // A recipe could in principle build zero sources; nothing to wait on.
    if (bctx.sources.length === 0) cleanup()
  }

  function stopAll(): void {
    const now = ctx.currentTime
    const rampEnd = now + 0.03
    for (const voice of activeVoices) {
      voice.gainNode.gain.cancelScheduledValues(now)
      voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now)
      voice.gainNode.gain.linearRampToValueAtTime(0, rampEnd)
      for (const src of voice.sources) {
        try {
          src.stop(rampEnd + 0.005)
        } catch {
          // Already stopped/ended; onended cleanup will still run.
        }
      }
    }
    activeVoices.clear()
  }

  return { ctx, resume, scheduleNote, stopAll }
}
