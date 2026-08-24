/**
 * Synthesis recipes for every chiptune preset in `CHIPTUNE_PRESETS`
 * (types.ts). This file only *describes* how each preset should sound —
 * duty cycles, filter shapes, envelope timing, FM ratios, etc. Turning a
 * recipe into an actual Web Audio graph happens in audio-engine.ts, which
 * imports `SynthRecipe` and reads these fields; nothing here touches
 * `AudioContext` directly, so this file has no runtime dependency on the
 * browser and can be reasoned about (or unit tested) in isolation.
 *
 * `CHIPTUNE_PRESETS` in types.ts is the source of truth for id/label/
 * category; `PresetId` below is a hand-kept literal mirror of its 39 ids
 * (the "chiptune presets" list currently has 39 entries, not 38, across
 * the 9 categories — see the recipe table below for the full accounting).
 * Keeping the union local (rather than deriving it from the `string`-typed
 * `ChiptunePreset.id`) is what lets `SYNTH_RECIPES` below be checked for
 * completeness at compile time: `Record<PresetId, SynthRecipe>` fails to
 * typecheck if an id is missing, renamed, or misspelled.
 */

/** A biquad filter stage. `frequency` is an absolute cutoff/center in Hz. */
export interface FilterSpec {
  type: BiquadFilterType
  frequency: number
  q?: number
}

/**
 * A pitch ramp applied on note attack, expressed relative to the note's own
 * target frequency — e.g. `startRatio: 0.5` starts an octave below the
 * played pitch and glides up to it. Used for pulse-sweep style "whoop" and
 * arcade power-up effects, not for detuning the sustained tone.
 */
export interface SweepSpec {
  /** Frequency ratio (relative to target frequency) the sweep starts from. */
  startRatio: number
  /** Ramp duration in ms, starting at note-on. */
  ms: number
}

/**
 * Slow LFO modulation of a source's `.detune` (cents), for tape-style wow
 * and flutter. Only meaningful on pitched sources (oscillator/pulse/
 * bitcrush recipes).
 */
export interface LfoWobbleSpec {
  rateHz: number
  depthCents: number
}

/** One overtone in an `additive` recipe, relative to the fundamental. */
export interface AdditivePartial {
  ratio: number
  gain: number
}

/**
 * Shared amplitude-envelope shape.
 *
 * `sustain: true` means the sound holds at peak for the note's full
 * scheduled `duration` and only releases (over `releaseMs`) once the note
 * ends — how a held instrument (pulse lead, organ, pad) behaves.
 *
 * `sustain: false` means the sound decays on its own after the attack,
 * independent of the notated duration — how a struck/plucked/percussive
 * sound (bell, chime, noise hit) behaves. `decayMs` sets that decay time;
 * if omitted it defaults to the note's `duration`.
 */
export interface EnvelopeSpec {
  /** Time from note-on to peak gain, ms. Kept short (a few ms) to avoid a click. */
  attackMs: number
  sustain: boolean
  /** Release time after note-off, ms. Used when `sustain` is true. */
  releaseMs: number
  /** Decay-from-peak time, ms. Used when `sustain` is false; defaults to `duration`. */
  decayMs?: number
}

interface RecipeBase {
  envelope: EnvelopeSpec
}

export type SynthRecipe =
  | (RecipeBase & {
      kind: "oscillator"
      type: OscillatorType
      filter?: FilterSpec
      /** Extra detuned copies summed with the main voice (0 = just one oscillator). */
      detuneVoices?: number
      /** Spacing between stacked voices, in cents. Defaults to 10 if `detuneVoices` is set. */
      detuneCents?: number
      sweep?: SweepSpec
      lfoWobble?: LfoWobbleSpec
    })
  | (RecipeBase & {
      kind: "pulse"
      /** Duty cycle 0..1, realized as a custom PeriodicWave built from pulse Fourier coefficients. */
      duty: number
      filter?: FilterSpec
      sweep?: SweepSpec
      lfoWobble?: LfoWobbleSpec
    })
  | (RecipeBase & {
      kind: "noise"
      filter?: FilterSpec
    })
  | (RecipeBase & {
      kind: "fm"
      /** Carrier frequency = note frequency * carrierRatio. */
      carrierRatio: number
      /** Modulator frequency = note frequency * modulatorRatio. */
      modulatorRatio: number
      /** FM index (beta); peak frequency deviation of the carrier = modIndex * modulator frequency. */
      modIndex: number
      /** "Blooming brass": ramp modIndex from ~0 up to its full value during the attack. */
      modIndexAttackRamp?: boolean
    })
  | (RecipeBase & {
      kind: "ringmod"
      carrierType: OscillatorType
      /** Modulator frequency = note frequency * modulatorRatio. Non-integer ratios sound metallic/inharmonic. */
      modulatorRatio: number
    })
  | (RecipeBase & {
      kind: "additive"
      partials: AdditivePartial[]
    })
  | (RecipeBase & {
      kind: "bitcrush"
      baseType: OscillatorType
      /** Quantization levels the waveform is snapped to (e.g. 16 ~ 4-bit, 256 ~ 8-bit). Also used for a light "steppy" quantized-wavetable effect (nes-triangle, gb-wave). */
      steps: number
      filter?: FilterSpec
      lfoWobble?: LfoWobbleSpec
    })

export type PresetId =
  | "pulse-12"
  | "pulse-25"
  | "pulse-50"
  | "pulse-75"
  | "pulse-sweep"
  | "tri-clean"
  | "tri-soft"
  | "tri-detuned"
  | "saw-bright"
  | "saw-warm"
  | "saw-stack"
  | "nes-pulse1"
  | "nes-pulse2"
  | "nes-triangle"
  | "nes-noise"
  | "nes-dpcm"
  | "gb-pulse-a"
  | "gb-pulse-b"
  | "gb-wave"
  | "gb-noise"
  | "sid-pulse"
  | "sid-saw"
  | "sid-triangle"
  | "sid-ringmod"
  | "sid-noise"
  | "fm-bell"
  | "fm-bass"
  | "fm-organ"
  | "fm-brass"
  | "arcade-lead"
  | "arcade-bass"
  | "arcade-pad"
  | "arcade-fx"
  | "bell-8bit"
  | "chime-8bit"
  | "organ-8bit"
  | "crush-4bit"
  | "crush-8bit"
  | "tape-lofi"

/** n semitones above (positive) or below (negative) as a frequency ratio. */
function semitoneRatio(n: number): number {
  return Math.pow(2, n / 12)
}

/** A sound that holds at peak for the note's full duration, then releases. */
function held(attackMs: number, releaseMs: number): EnvelopeSpec {
  return { attackMs, sustain: true, releaseMs }
}

/** A sound that decays on its own after the attack, independent of duration. */
function decaying(attackMs: number, decayMs: number, releaseMs = 20): EnvelopeSpec {
  return { attackMs, sustain: false, releaseMs, decayMs }
}

export const SYNTH_RECIPES: Record<PresetId, SynthRecipe> = {
  // --- Pulse & Square ---------------------------------------------------
  "pulse-12": { kind: "pulse", duty: 0.125, envelope: held(4, 30) },
  "pulse-25": { kind: "pulse", duty: 0.25, envelope: held(4, 30) },
  // Native OscillatorType "square" is an exact, cheap 50% duty pulse.
  "pulse-50": { kind: "oscillator", type: "square", envelope: held(3, 25) },
  // Duty d and duty (1-d) pulse waves share the same |Fourier magnitude|
  // spectrum (sin(n*pi*d) === |sin(n*pi*(1-d))|), so 75% would be nearly
  // indistinguishable from 25% by duty cycle alone. A touch of lowpass and
  // a slightly slower attack give it its own identity.
  "pulse-75": {
    kind: "pulse",
    duty: 0.75,
    filter: { type: "lowpass", frequency: 7500, q: 0.7 },
    envelope: held(6, 30),
  },
  "pulse-sweep": {
    kind: "pulse",
    duty: 0.5,
    sweep: { startRatio: semitoneRatio(-4), ms: 40 }, // starts a major third below, glides up
    envelope: held(4, 30),
  },

  // --- Triangle -----------------------------------------------------------
  "tri-clean": { kind: "oscillator", type: "triangle", envelope: held(5, 40) },
  "tri-soft": {
    kind: "oscillator",
    type: "triangle",
    filter: { type: "lowpass", frequency: 1500, q: 0.7 },
    envelope: held(8, 60),
  },
  "tri-detuned": {
    kind: "oscillator",
    type: "triangle",
    detuneVoices: 2,
    detuneCents: 9,
    envelope: held(6, 45),
  },

  // --- Sawtooth -----------------------------------------------------------
  "saw-bright": { kind: "oscillator", type: "sawtooth", envelope: held(4, 35) },
  "saw-warm": {
    kind: "oscillator",
    type: "sawtooth",
    filter: { type: "lowpass", frequency: 1200, q: 0.7 },
    envelope: held(10, 60),
  },
  "saw-stack": {
    kind: "oscillator",
    type: "sawtooth",
    detuneVoices: 2,
    detuneCents: 12,
    envelope: held(6, 50),
  },

  // --- Console -- NES -------------------------------------------------------
  // Real NES pulse channels offered 12.5/25/50/75% duty; pulse1 vs pulse2
  // differ (12.5% vs 25%), same as on real hardware.
  "nes-pulse1": { kind: "pulse", duty: 0.125, envelope: held(3, 20) },
  "nes-pulse2": { kind: "pulse", duty: 0.25, envelope: held(3, 20) },
  // The NES triangle channel is a 32-step 4-bit staircase, not a smooth
  // triangle — reuse the bitcrush technique on a triangle base for that
  // quantized, slightly gritty character.
  "nes-triangle": { kind: "bitcrush", baseType: "triangle", steps: 16, envelope: held(4, 30) },
  "nes-noise": {
    kind: "noise",
    filter: { type: "bandpass", frequency: 3000, q: 0.8 },
    envelope: decaying(2, 180, 20),
  },
  // NES DPCM was used almost exclusively for short percussive samples.
  "nes-dpcm": {
    kind: "noise",
    filter: { type: "lowpass", frequency: 2500, q: 0.5 },
    envelope: decaying(1, 90, 10),
  },

  // --- Console -- Game Boy --------------------------------------------------
  "gb-pulse-a": { kind: "pulse", duty: 0.5, envelope: held(4, 25) },
  "gb-pulse-b": {
    kind: "pulse",
    duty: 0.75,
    filter: { type: "lowpass", frequency: 8000 },
    envelope: held(4, 25),
  },
  // GB's wave channel plays a 32-sample, 4-bit wavetable — same "steppy"
  // quantized idea as nes-triangle, plus a soft lowpass for the GB DAC's
  // duller top end (what actually separates it from nes-triangle).
  "gb-wave": {
    kind: "bitcrush",
    baseType: "triangle",
    steps: 16,
    filter: { type: "lowpass", frequency: 4000, q: 0.6 },
    envelope: held(6, 35),
  },
  "gb-noise": {
    kind: "noise",
    filter: { type: "highpass", frequency: 1200, q: 0.6 },
    envelope: decaying(2, 140, 20),
  },

  // --- Console -- SID (C64) -------------------------------------------------
  // SID's claim to fame is its resonant multimode filter, so every SID
  // preset leans on a higher-Q lowpass to evoke it.
  "sid-pulse": {
    kind: "pulse",
    duty: 0.4,
    filter: { type: "lowpass", frequency: 6000, q: 4 },
    envelope: held(5, 40),
  },
  "sid-saw": {
    kind: "oscillator",
    type: "sawtooth",
    filter: { type: "lowpass", frequency: 5000, q: 5 },
    envelope: held(5, 45),
  },
  "sid-triangle": {
    kind: "oscillator",
    type: "triangle",
    filter: { type: "lowpass", frequency: 7000, q: 2 },
    envelope: held(6, 45),
  },
  // Genuine ring modulation (carrier amplitude-modulated by a second
  // oscillator), the classic SID "clangorous bell" trick. A non-integer
  // modulator ratio keeps the result inharmonic/metallic.
  "sid-ringmod": {
    kind: "ringmod",
    carrierType: "triangle",
    modulatorRatio: 1.5,
    envelope: held(5, 40),
  },
  "sid-noise": {
    kind: "noise",
    filter: { type: "lowpass", frequency: 9000, q: 0.9 },
    envelope: decaying(2, 220, 25),
  },

  // --- FM Synth -------------------------------------------------------------
  // Hardcoded 2-operator patches (modulator FM'ing the carrier's frequency).
  "fm-bell": { kind: "fm", carrierRatio: 1, modulatorRatio: 3.5, modIndex: 6, envelope: decaying(2, 900, 50) },
  "fm-bass": { kind: "fm", carrierRatio: 1, modulatorRatio: 1, modIndex: 2.5, envelope: held(4, 40) },
  "fm-organ": { kind: "fm", carrierRatio: 1, modulatorRatio: 2, modIndex: 1.5, envelope: held(8, 30) },
  // Classic "blooming brass": modulation index ramps up during the attack.
  "fm-brass": {
    kind: "fm",
    carrierRatio: 1,
    modulatorRatio: 1,
    modIndex: 5,
    modIndexAttackRamp: true,
    envelope: held(18, 60),
  },

  // --- Arcade -----------------------------------------------------------
  "arcade-lead": { kind: "oscillator", type: "square", envelope: held(2, 15) },
  "arcade-bass": {
    kind: "oscillator",
    type: "sawtooth",
    filter: { type: "lowpass", frequency: 500, q: 3 },
    envelope: held(3, 30),
  },
  "arcade-pad": {
    kind: "oscillator",
    type: "sawtooth",
    detuneVoices: 3,
    detuneCents: 10,
    filter: { type: "lowpass", frequency: 3500, q: 0.7 },
    envelope: held(40, 300),
  },
  // "Power-Up": fast upward sweep on attack, relative to the played pitch
  // (it's a normal notated note in a voice, not a one-shot SFX trigger).
  "arcade-fx": {
    kind: "oscillator",
    type: "square",
    sweep: { startRatio: semitoneRatio(-12), ms: 90 },
    envelope: held(3, 40),
  },

  // --- Bells & Chimes ---------------------------------------------------
  // Reuse the FM-bell patch shape; bell = longer decay, chime = shorter/brighter.
  "bell-8bit": { kind: "fm", carrierRatio: 1, modulatorRatio: 3.5, modIndex: 5, envelope: decaying(2, 700, 40) },
  "chime-8bit": { kind: "fm", carrierRatio: 1, modulatorRatio: 5, modIndex: 4, envelope: decaying(1, 350, 30) },
  // Fundamental + octave + twelfth ("fifth" drawbar) partials, sustained —
  // organs don't decay while a key is held.
  "organ-8bit": {
    kind: "additive",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.33 },
    ],
    envelope: held(10, 40),
  },

  // --- Lo-Fi & Noise ------------------------------------------------------
  "crush-4bit": {
    kind: "bitcrush",
    baseType: "sawtooth",
    steps: 16,
    filter: { type: "lowpass", frequency: 4000, q: 1.5 },
    envelope: held(5, 40),
  },
  "crush-8bit": {
    kind: "bitcrush",
    baseType: "sawtooth",
    steps: 256,
    filter: { type: "lowpass", frequency: 6000, q: 1 },
    envelope: held(5, 40),
  },
  "tape-lofi": {
    kind: "oscillator",
    type: "triangle",
    filter: { type: "lowpass", frequency: 2200, q: 0.8 },
    lfoWobble: { rateHz: 4, depthCents: 15 },
    envelope: held(15, 80),
  },
}

const DEFAULT_RECIPE: SynthRecipe = { kind: "oscillator", type: "square", envelope: held(4, 30) }

/**
 * Safe lookup for a (runtime, not statically known) preset id. Falls back
 * to a plain square-wave recipe for anything unrecognized rather than
 * throwing, since `presetId` arrives as a bare `string` off `Voice` data.
 */
export function getSynthRecipe(presetId: string): SynthRecipe {
  const recipe = (SYNTH_RECIPES as Record<string, SynthRecipe | undefined>)[presetId]
  if (!recipe) {
    console.warn(`[synth-presets] Unknown presetId "${presetId}", falling back to default recipe.`)
    return DEFAULT_RECIPE
  }
  return recipe
}
