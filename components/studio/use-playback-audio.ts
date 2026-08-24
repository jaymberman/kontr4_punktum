"use client"

import { useCallback, useEffect, useRef, type RefObject } from "react"
import type { TimeSignature, Voice } from "@/components/studio/types"
import { TICKS_PER_QUARTER, flattenTiesToSpans, flattenVoice } from "@/components/studio/rhythm"
import { spelledPitchToMidi } from "@/components/studio/staff-geometry"
import { createEngine, type AudioEngine } from "@/components/studio/audio-engine"

export interface UsePlaybackAudioArgs {
  voices: Voice[]
  timeSignature: TimeSignature
  measureCount: number
  isPlaying: boolean
  isLooping: boolean
  loopStart: number
  loopEnd: number
  bpm: number
  masterVolume: number
  /** Mirrors playheadBeat — the same ref the visual rAF transport loop reads/writes. */
  beatRef: RefObject<number>
}

/** If solo'd voices exist, only they sound; otherwise every non-muted voice does. */
function shouldSound(voice: Voice, all: Voice[]): boolean {
  const anySolo = all.some((v) => v.solo)
  return anySolo ? voice.solo : !voice.muted
}

const LOOKAHEAD_SECONDS = 0.15
const SCHEDULER_INTERVAL_MS = 25
/** How far behind "now" the watermark can drift before it's treated as a stale/skipped seek rather than normal lag. */
const RESYNC_THRESHOLD_TICKS = TICKS_PER_QUARTER * 4

/**
 * Schedules real audio to match the existing visual playhead. Runs its own
 * short setInterval lookahead loop (Chris Wilson's "tale of two clocks"
 * pattern) alongside — not merged into — the rAF loop that already drives
 * `beatRef`/`playheadBeat`, so it can't disturb that loop's carefully
 * tuned wrap/flicker handling. Both loops read the same `beatRef`, so they
 * stay in sync without being coupled.
 *
 * The beat<->AudioContext-time mapping is recomputed fresh every tick from
 * `ctx.currentTime` and `beatRef.current` sampled together, rather than
 * maintained as a persistent anchor — simpler, and self-correcting against
 * any drift between the two clocks every ~25ms.
 */
export function usePlaybackAudio(args: UsePlaybackAudioArgs) {
  // Lazily created, and only ever from inside an effect/event handler
  // (never during render) — `new AudioContext()` throws during Next.js's
  // server-render pass, where no such browser API exists.
  const engineRef = useRef<AudioEngine | null>(null)
  const getEngine = useCallback((): AudioEngine => {
    if (!engineRef.current) engineRef.current = createEngine()
    return engineRef.current
  }, [])

  const argsRef = useRef(args)
  useEffect(() => {
    argsRef.current = args
  })

  useEffect(() => {
    if (!args.isPlaying) {
      engineRef.current?.stopAll()
      return
    }
    const engine = getEngine()

    // Ticks already scheduled up to (exclusive). null = not yet initialized
    // for this play session.
    let watermarkTick: number | null = null
    // Previous tick's beat, so a loop wrap (beat suddenly dropping) can be
    // told apart from a plain forward-playing tick.
    let prevBeat: number | null = null

    const tick = () => {
      const a = argsRef.current
      const bps = a.bpm / 60
      const nowBeat = a.beatRef.current
      const nowTick = nowBeat * TICKS_PER_QUARTER
      const lookaheadTicks = LOOKAHEAD_SECONDS * bps * TICKS_PER_QUARTER
      const windowEndTick = nowTick + lookaheadTicks

      // A loop wrap can land between two scheduler ticks: the visual
      // playhead has already snapped back to loopStart by the time this
      // tick observes it. Resetting the watermark to `nowTick` in that case
      // would silently skip every tick between loopStart and here — a small
      // but real desync right at the seam. Detect the wrap specifically
      // (beat dropped, and landed within a tick or two of loopStart, as
      // opposed to a manual backward seek to an arbitrary position) and
      // resume from loopStart instead, so nothing in that sliver is dropped.
      const wrapSlop = (SCHEDULER_INTERVAL_MS / 1000) * bps * 2
      const wrapped =
        a.isLooping &&
        prevBeat !== null &&
        nowBeat < prevBeat - 1e-6 &&
        nowBeat < a.loopStart + wrapSlop
      prevBeat = nowBeat

      if (wrapped) {
        watermarkTick = a.loopStart * TICKS_PER_QUARTER
      } else if (
        watermarkTick === null ||
        watermarkTick > windowEndTick ||
        watermarkTick < nowTick - RESYNC_THRESHOLD_TICKS
      ) {
        watermarkTick = nowTick
      }
      const from = watermarkTick

      if (from < windowEndTick) {
        const ctxNow = engine.ctx.currentTime
        const audioTimeForBeat = (beat: number) => ctxNow + (beat - nowBeat) / bps

        const loopEndTick = a.loopEnd * TICKS_PER_QUARTER

        for (const voice of a.voices) {
          if (!shouldSound(voice, a.voices)) continue
          const flat = flattenVoice(voice, a.timeSignature, a.measureCount)
          const spans = flattenTiesToSpans(flat)
          for (const span of spans) {
            if (span.startTick < from || span.startTick >= windowEndTick) continue
            // A span starting at/after the loop end never sounds: the visual
            // playhead wraps before reaching it, so scheduling it here would
            // play a note "from the future" that lands after the audible
            // wrap, out of sync with what's on screen.
            if (a.isLooping && span.startTick >= loopEndTick) continue

            const startBeat = span.startTick / TICKS_PER_QUARTER
            let endBeat = startBeat + span.ticks / TICKS_PER_QUARTER
            if (a.isLooping && endBeat > a.loopEnd) endBeat = a.loopEnd
            const durationSeconds = Math.max(0, (endBeat - startBeat) / bps)
            if (durationSeconds <= 0) continue

            engine.scheduleNote({
              presetId: voice.presetId,
              midi: spelledPitchToMidi(span.step, span.accidental),
              startTime: audioTimeForBeat(startBeat),
              duration: durationSeconds,
              volume: voice.volume,
              pan: voice.pan,
              masterVolume: a.masterVolume,
            })
          }
        }

        watermarkTick = windowEndTick
      }
    }

    tick()
    const interval = setInterval(tick, SCHEDULER_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [args.isPlaying, getEngine])

  const resume = useCallback(() => getEngine().resume(), [getEngine])

  return { resume }
}
