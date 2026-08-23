"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AppHeader } from "@/components/studio/app-header"
import { StaffCanvas } from "@/components/studio/staff-canvas"
import { RightPanel } from "@/components/studio/right-panel"
import { MIN_LOOP_BEATS } from "@/components/studio/transport-bar"
import {
  INITIAL_VOICES,
  TEMPO_MARKINGS,
  VOICE_COLORS,
  type OctaveShift,
  type Voice,
} from "@/components/studio/types"

const BEATS_PER_MEASURE = 4
const INITIAL_MEASURE_COUNT = 4

/** A score always has at least one measure; there is no upper bound. */
const MIN_MEASURES = 1

export function StudioShell() {
  const [voices, setVoices] = useState<Voice[]>(INITIAL_VOICES)
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(
    INITIAL_VOICES[0]?.id ?? null,
  )
  const [measureCount, setMeasureCount] = useState(INITIAL_MEASURE_COUNT)
  const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null)
  const [songName, setSongName] = useState("Prelude 1")
  const [musicalKey, setMusicalKey] = useState("D minor")
  const [tempo, setTempo] = useState("Andante")
  const [timeSignature, setTimeSignature] = useState("4/4")
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [masterVolume, setMasterVolume] = useState(78)

  const totalBeats = measureCount * BEATS_PER_MEASURE

  /**
   * Playback position in beats, as a continuous value rather than a beat
   * index. The integer beat is derived where it is needed (note
   * highlighting), which is what lets the playhead glide.
   */
  const [playheadBeat, setPlayheadBeat] = useState(0)
  /** Mirror of the above so the animation loop never reads stale state. */
  const beatRef = useRef(0)

  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(INITIAL_MEASURE_COUNT * BEATS_PER_MEASURE)

  const bpm = TEMPO_MARKINGS.find((t) => t.name === tempo)?.bpm ?? 92

  const seek = useCallback((beat: number) => {
    const next = Math.max(0, beat)
    beatRef.current = next
    setPlayheadBeat(next)
  }, [])

  /**
   * Keep the loop region valid as the score length changes. A loop that
   * covered the whole score keeps covering it when measures are appended.
   */
  const prevTotalRef = useRef(totalBeats)
  useEffect(() => {
    const prevTotal = prevTotalRef.current
    prevTotalRef.current = totalBeats
    if (prevTotal === totalBeats) return

    setLoopEnd((prev) =>
      prev >= prevTotal ? totalBeats : Math.min(prev, totalBeats),
    )
    setLoopStart((prev) => Math.max(0, Math.min(prev, totalBeats - 1)))
    if (beatRef.current > totalBeats) seek(totalBeats)
  }, [totalBeats, seek])

  /**
   * Transport. Driven by requestAnimationFrame so position advances by
   * real elapsed time, giving sub-beat resolution instead of the stepwise
   * motion a per-beat interval produced.
   */
  useEffect(() => {
    if (!isPlaying) return

    const span = Math.max(1e-6, loopEnd - loopStart)
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const elapsed = (now - last) / 1000
      last = now
      let next = beatRef.current + elapsed * (bpm / 60)

      if (next >= loopEnd) {
        if (isLooping) {
          // Wrap by the exact overshoot so no frame is ever painted past
          // loopEnd. `% span` keeps this correct even if a long frame
          // skips clean over the whole loop.
          next = loopStart + ((next - loopStart) % span)
          // Commit the wrapped position immediately: letting the frame
          // fall through to the shared setState below would first paint
          // the pre-wrap value, which is the "runs past the end, then
          // pops back" flicker.
          beatRef.current = next
          setPlayheadBeat(next)
          frame = requestAnimationFrame(tick)
          return
        }
        beatRef.current = loopEnd
        setPlayheadBeat(loopEnd)
        setIsPlaying(false)
        return
      }

      beatRef.current = next
      setPlayheadBeat(next)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, bpm, isLooping, loopStart, loopEnd])

  /** Start from the loop's beginning whenever the playhead sits outside it. */
  const handleTogglePlay = () => {
    if (!isPlaying) {
      const at = beatRef.current
      if (at < loopStart || at >= loopEnd - 1e-6) seek(loopStart)
    }
    setIsPlaying((p) => !p)
  }

  /**
   * Commit a new loop span. Clamped to the score and to a one-beat
   * minimum, and the playhead is pulled inside the new span so playback
   * can't be left stranded outside the region it is meant to repeat.
   */
  const handleLoopChange = useCallback(
    (start: number, end: number) => {
      const total = measureCount * BEATS_PER_MEASURE
      // Boundaries are continuous, so these clamp against the minimum
      // span rather than rounding to whole beats.
      const nextStart = Math.max(0, Math.min(start, total - MIN_LOOP_BEATS))
      const nextEnd = Math.min(
        total,
        Math.max(end, nextStart + MIN_LOOP_BEATS),
      )
      setLoopStart(nextStart)
      setLoopEnd(nextEnd)
      if (beatRef.current < nextStart || beatRef.current > nextEnd) {
        seek(nextStart)
      }
    },
    [measureCount, seek],
  )

  const handleUpdateVoice = useCallback((id: string, patch: Partial<Voice>) => {
    setVoices((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  }, [])

  const handleStop = () => {
    setIsPlaying(false)
    seek(loopStart)
  }

  /** Append measures. The score length is unbounded. */
  const handleAddMeasures = useCallback((count: number) => {
    const safe = Math.max(1, Math.trunc(count))
    setMeasureCount((prev) => prev + safe)
  }, [])

  /**
   * Remove one measure and splice the corresponding beats out of every
   * voice, so the notes after it shift left rather than being orphaned.
   * Octave brackets on later measures shift down with them.
   */
  const handleDeleteMeasure = useCallback((measureIndex: number) => {
    setMeasureCount((count) => {
      if (count <= MIN_MEASURES) return count
      const start = measureIndex * BEATS_PER_MEASURE
      setVoices((prev) =>
        prev.map((v) => {
          const notes = [...v.notes]
          notes.splice(start, BEATS_PER_MEASURE)
          const octaveMarks: Record<number, OctaveShift> = {}
          for (const [key, shift] of Object.entries(v.octaveMarks)) {
            const m = Number(key)
            if (m === measureIndex) continue
            octaveMarks[m > measureIndex ? m - 1 : m] = shift
          }
          return { ...v, notes, octaveMarks }
        }),
      )
      setSelectedMeasure(null)
      return count - 1
    })
  }, [])

  /**
   * Toggle an octave bracket on the selected measure of the active voice.
   * Re-applying the same shift clears it.
   */
  const handleSetOctaveShift = useCallback(
    (shift: OctaveShift) => {
      if (selectedMeasure === null || !activeVoiceId) return
      setVoices((prev) =>
        prev.map((v) => {
          if (v.id !== activeVoiceId) return v
          const octaveMarks = { ...v.octaveMarks }
          if (octaveMarks[selectedMeasure] === shift) {
            delete octaveMarks[selectedMeasure]
          } else {
            octaveMarks[selectedMeasure] = shift
          }
          return { ...v, octaveMarks }
        }),
      )
    },
    [selectedMeasure, activeVoiceId],
  )

  /**
   * Create a voice on the bottom, claiming a random unused palette color.
   * Capped at the palette size so no two voices ever share a color, which
   * is what makes them tellable apart on the score.
   */
  const handleAddVoice = useCallback(() => {
    setVoices((prev) => {
      const used = new Set(prev.map((v) => v.color))
      const free = VOICE_COLORS.filter((c) => !used.has(c))
      if (free.length === 0) return prev
      const color = free[Math.floor(Math.random() * free.length)]
      const id = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const next: Voice = {
        id,
        name: `Voice ${prev.length + 1}`,
        clef: "treble",
        presetId: "pulse-50",
        volume: 70,
        pan: 0,
        muted: false,
        solo: false,
        color,
        notes: [],
        octaveMarks: {},
      }
      setActiveVoiceId(id)
      return [...prev, next]
    })
  }, [])

  const handleDeleteVoice = useCallback((id: string) => {
    setVoices((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((v) => v.id !== id)
      setActiveVoiceId((current) => (current === id ? next[0]?.id ?? null : current))
      return next
    })
  }, [])

  /** Move a voice to a new index, for drag-to-reorder in the Voices panel. */
  const handleReorderVoices = useCallback((fromId: string, toId: string) => {
    setVoices((prev) => {
      const from = prev.findIndex((v) => v.id === fromId)
      const to = prev.findIndex((v) => v.id === toId)
      if (from === -1 || to === -1 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-noise">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,oklch(0.3_0.06_255_/_35%),transparent_55%),radial-gradient(circle_at_85%_90%,oklch(0.28_0.07_195_/_25%),transparent_50%)]" />

      <AppHeader
        musicalKey={musicalKey}
        onKeyChange={setMusicalKey}
        tempo={tempo}
        onTempoChange={setTempo}
        timeSignature={timeSignature}
        onTimeSignatureChange={setTimeSignature}
        isPlaying={isPlaying}
        isLooping={isLooping}
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onToggleLoop={() => setIsLooping((l) => !l)}
        masterVolume={masterVolume}
        onMasterVolumeChange={setMasterVolume}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <div className="min-h-[280px] min-w-0 flex-1 md:min-h-0">
            <StaffCanvas
              voices={voices}
              activeVoiceId={activeVoiceId}
              isPlaying={isPlaying}
              playheadBeat={playheadBeat}
              loopStart={loopStart}
              loopEnd={loopEnd}
              isLooping={isLooping}
              measureCount={measureCount}
              beatsPerMeasure={BEATS_PER_MEASURE}
              canDeleteMeasure={measureCount > MIN_MEASURES}
              selectedMeasure={selectedMeasure}
              songName={songName}
              musicalKey={musicalKey}
              onSongNameChange={setSongName}
              onUpdateVoice={handleUpdateVoice}
              onSelectVoice={setActiveVoiceId}
              onSelectMeasure={setSelectedMeasure}
              onAddMeasures={handleAddMeasures}
              onDeleteMeasure={handleDeleteMeasure}
              onSetOctaveShift={handleSetOctaveShift}
              onSeek={seek}
              onLoopChange={handleLoopChange}
            />
          </div>

          <RightPanel
            voices={voices}
            activeVoiceId={activeVoiceId}
            isPlaying={isPlaying}
            onSelectVoice={setActiveVoiceId}
            onUpdateVoice={handleUpdateVoice}
            onAddVoice={handleAddVoice}
            onDeleteVoice={handleDeleteVoice}
            onReorderVoices={handleReorderVoices}
          />
        </div>
      </div>
    </div>
  )
}
