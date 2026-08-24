"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AppHeader } from "@/components/studio/app-header"
import { StaffCanvas } from "@/components/studio/staff-canvas"
import { RightPanel } from "@/components/studio/right-panel"
import { MIN_LOOP_BEATS } from "@/components/studio/transport-bar"
import {
  INITIAL_VOICES,
  KEY_SIGNATURES,
  TEMPO_MARKINGS,
  VOICE_COLORS,
  type NoteEvent,
  type NoteInputState,
  type OctaveShift,
  type TimeSignature,
  type Voice,
} from "@/components/studio/types"
import {
  beatsPerMeasure as beatsPerMeasureOf,
  buildNoteEvent,
  buildRestEvent,
  findEventAtTick,
  getMeasureOrImplicit,
  nextEventBoundary,
  placeEvent,
  prevEventBoundary,
  resolveNoteAccidental,
  updateVoiceMeasure,
  type CursorPos,
} from "@/components/studio/rhythm"
import { useNoteEntryKeybinds } from "@/components/studio/use-note-entry-keybinds"
import { usePlaybackAudio } from "@/components/studio/use-playback-audio"

const INITIAL_MEASURE_COUNT = 4
const INITIAL_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 }

/** A score always has at least one measure; there is no upper bound. */
const MIN_MEASURES = 1
const MAX_HISTORY = 100

interface HistoryEntry {
  voices: Voice[]
  measureCount: number
}

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
  const [timeSignature, setTimeSignature] = useState<TimeSignature>(INITIAL_TIME_SIGNATURE)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [masterVolume, setMasterVolume] = useState(78)

  const beatsPerMeasure = beatsPerMeasureOf(timeSignature)
  const totalBeats = measureCount * beatsPerMeasure

  /**
   * Playback position in beats, as a continuous value rather than a beat
   * index. The integer beat is derived where it is needed (note
   * highlighting), which is what lets the playhead glide.
   */
  const [playheadBeat, setPlayheadBeat] = useState(0)
  /** Mirror of the above so the animation loop never reads stale state. */
  const beatRef = useRef(0)

  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(INITIAL_MEASURE_COUNT * beatsPerMeasureOf(INITIAL_TIME_SIGNATURE))

  const bpm = TEMPO_MARKINGS.find((t) => t.name === tempo)?.bpm ?? 92

  // Mirrors, so callbacks that must stay referentially stable (read by the
  // global keybind hook's effect deps) can still read the latest values —
  // the same pattern beatRef already uses for the rAF transport loop.
  const voicesRef = useRef(voices)
  useEffect(() => {
    voicesRef.current = voices
  }, [voices])
  const measureCountRef = useRef(measureCount)
  useEffect(() => {
    measureCountRef.current = measureCount
  }, [measureCount])

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

  const { resume: resumeAudio } = usePlaybackAudio({
    voices,
    timeSignature,
    measureCount,
    isPlaying,
    isLooping,
    loopStart,
    loopEnd,
    bpm,
    masterVolume,
    beatRef,
  })

  /** Start from the loop's beginning whenever the playhead sits outside it. */
  const handleTogglePlay = () => {
    if (!isPlaying) {
      resumeAudio()
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
      const total = measureCount * beatsPerMeasure
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
    [measureCount, beatsPerMeasure, seek],
  )

  /**
   * Non-editing voice patches (clef, preset, color, volume, pan, mute,
   * solo) bypass undo history entirely — undo is scoped to notation edits,
   * and a slider drag firing on every pointer-move would otherwise spam
   * the history stack.
   */
  const handleUpdateVoice = useCallback((id: string, patch: Partial<Voice>) => {
    setVoices((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  }, [])

  /**
   * Selecting a voice from the mixer panel is about inspecting/adjusting
   * that voice, not typing notes into it — so unlike selecting one by
   * clicking a note on the staff, this doesn't bring the note-entry cursor
   * along with it.
   */
  const handleSelectVoiceFromPanel = useCallback((id: string) => {
    setActiveVoiceId(id)
    setHasEditFocus(false)
  }, [])

  const handleStop = () => {
    setIsPlaying(false)
    seek(loopStart)
  }

  // ---- Undo/redo -----------------------------------------------------

  const [past, setPast] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
  // Mirrors, for the same reason voicesRef/measureCountRef exist: undo/redo
  // need a synchronous read of the latest stack without nesting setState
  // calls inside another setState's updater (which React's StrictMode
  // double-invokes — any side effect in there, like calling setVoices,
  // fires twice and corrupts state across the double-invocation).
  const pastRef = useRef(past)
  useEffect(() => {
    pastRef.current = past
  }, [past])
  const futureRef = useRef(future)
  useEffect(() => {
    futureRef.current = future
  }, [future])

  /** Snapshots the current (pre-change) state, then applies `next`. */
  const commit = useCallback((next: { voices?: Voice[]; measureCount?: number }) => {
    const entry: HistoryEntry = {
      voices: voicesRef.current,
      measureCount: measureCountRef.current,
    }
    setPast((p) => [...p, entry].slice(-MAX_HISTORY))
    setFuture([])
    if (next.voices) setVoices(next.voices)
    if (next.measureCount !== undefined) setMeasureCount(next.measureCount)
  }, [])

  const undo = useCallback(() => {
    const p = pastRef.current
    if (p.length === 0) return
    const entry = p[p.length - 1]
    setFuture((f) => [...f, { voices: voicesRef.current, measureCount: measureCountRef.current }])
    setPast((prev) => prev.slice(0, -1))
    setVoices(entry.voices)
    setMeasureCount(entry.measureCount)
  }, [])

  const redo = useCallback(() => {
    const f = futureRef.current
    if (f.length === 0) return
    const entry = f[f.length - 1]
    setPast((p) => [...p, { voices: voicesRef.current, measureCount: measureCountRef.current }])
    setFuture((prev) => prev.slice(0, -1))
    setVoices(entry.voices)
    setMeasureCount(entry.measureCount)
  }, [])

  /** Append measures. The score length is unbounded. */
  const handleAddMeasures = useCallback(
    (count: number) => {
      const safe = Math.max(1, Math.trunc(count))
      commit({ measureCount: measureCountRef.current + safe })
    },
    [commit],
  )

  /**
   * Remove one measure and splice it out of every voice, so the notes
   * after it shift left rather than being orphaned. Octave brackets on
   * later measures shift down with them.
   */
  const handleDeleteMeasure = useCallback(
    (measureIndex: number) => {
      const count = measureCountRef.current
      if (count <= MIN_MEASURES) return
      const nextVoices = voicesRef.current.map((v) => {
        const measures = [...v.measures]
        if (measureIndex < measures.length) measures.splice(measureIndex, 1)
        const octaveMarks: Record<number, OctaveShift> = {}
        for (const [key, shift] of Object.entries(v.octaveMarks)) {
          const m = Number(key)
          if (m === measureIndex) continue
          octaveMarks[m > measureIndex ? m - 1 : m] = shift
        }
        return { ...v, measures, octaveMarks }
      })
      commit({ voices: nextVoices, measureCount: count - 1 })
      setSelectedMeasure(null)
    },
    [commit],
  )

  /**
   * Toggle an octave bracket on the selected measure of the active voice.
   * Re-applying the same shift clears it.
   */
  const handleSetOctaveShift = useCallback(
    (shift: OctaveShift) => {
      if (selectedMeasure === null || !activeVoiceId) return
      commit({
        voices: voicesRef.current.map((v) => {
          if (v.id !== activeVoiceId) return v
          const octaveMarks = { ...v.octaveMarks }
          if (octaveMarks[selectedMeasure] === shift) {
            delete octaveMarks[selectedMeasure]
          } else {
            octaveMarks[selectedMeasure] = shift
          }
          return { ...v, octaveMarks }
        }),
      })
    },
    [selectedMeasure, activeVoiceId, commit],
  )

  /**
   * Create a voice on the bottom, claiming a random unused palette color.
   * Capped at the palette size so no two voices ever share a color, which
   * is what makes them tellable apart on the score.
   */
  const handleAddVoice = useCallback(() => {
    const prev = voicesRef.current
    const used = new Set(prev.map((v) => v.color))
    const free = VOICE_COLORS.filter((c) => !used.has(c))
    if (free.length === 0) return
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
      measures: [],
      octaveMarks: {},
    }
    commit({ voices: [...prev, next] })
    setActiveVoiceId(id)
  }, [commit])

  const handleDeleteVoice = useCallback(
    (id: string) => {
      const prev = voicesRef.current
      if (prev.length <= 1) return
      const next = prev.filter((v) => v.id !== id)
      commit({ voices: next })
      setActiveVoiceId((current) => (current === id ? next[0]?.id ?? null : current))
    },
    [commit],
  )

  /** Move a voice to a new index, for drag-to-reorder in the Voices panel. */
  const handleReorderVoices = useCallback(
    (fromId: string, toId: string) => {
      const prev = voicesRef.current
      const from = prev.findIndex((v) => v.id === fromId)
      const to = prev.findIndex((v) => v.id === toId)
      if (from === -1 || to === -1 || from === to) return
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      commit({ voices: next })
    },
    [commit],
  )

  // ---- Note-level editing (shared by mouse click-to-place and keyboard) --

  const [cursor, setCursor] = useState<CursorPos>({ measureIndex: 0, tick: 0 })
  /**
   * Whether the note-entry cursor should actually be drawn. Defaults to
   * false so it doesn't appear on load looking like a stray artifact;
   * flips on the first real edit/navigation action and flips back off when
   * the user merely selects a different voice from the mixer panel (which
   * is about inspecting that voice, not typing notes into it).
   */
  const [hasEditFocus, setHasEditFocus] = useState(false)
  const [inputState, setInputStateRaw] = useState<NoteInputState>({
    duration: "quarter",
    dotted: false,
    pendingAccidental: null,
  })
  const setInputState = useCallback((patch: Partial<NoteInputState>) => {
    setInputStateRaw((s) => ({ ...s, ...patch }))
  }, [])

  const activeVoice = voices.find((v) => v.id === activeVoiceId) ?? null
  const eventAtCursor = activeVoice
    ? findEventAtTick(activeVoice, timeSignature, cursor.measureIndex, cursor.tick)
    : undefined
  const tieAtCursor = eventAtCursor?.kind === "note" ? eventAtCursor.tiedToNext : false

  const keySignature = KEY_SIGNATURES[musicalKey] ?? KEY_SIGNATURES["C major"]

  /** The one place a note/rest event actually gets written into a voice. */
  const placeEventAtCursor = useCallback(
    (voiceId: string, measureIndex: number, tick: number, event: NoteEvent) => {
      setHasEditFocus(true)
      commit({
        voices: voicesRef.current.map((v) =>
          v.id === voiceId
            ? updateVoiceMeasure(v, timeSignature, measureIndex, (m) =>
                placeEvent(m, timeSignature, tick, event),
              )
            : v,
        ),
      })
    },
    [commit, timeSignature],
  )

  const deleteAtCursor = useCallback(() => {
    if (!activeVoiceId) return
    const voice = voicesRef.current.find((v) => v.id === activeVoiceId)
    if (!voice) return
    const existing = findEventAtTick(voice, timeSignature, cursor.measureIndex, cursor.tick)
    if (!existing || existing.kind === "rest") return
    const rest = buildRestEvent({ duration: existing.duration, dotted: existing.dotted, pendingAccidental: null })
    placeEventAtCursor(activeVoiceId, cursor.measureIndex, cursor.tick, rest)
  }, [activeVoiceId, timeSignature, cursor, placeEventAtCursor])

  /** Mouse click-to-place: resolves a clicked staff position into a real
   *  NoteEvent using the same shared inputState/key-signature resolution
   *  keyboard entry uses, so both input methods agree. */
  const placeNoteAtClick = useCallback(
    (voiceId: string, measureIndex: number, tick: number, step: number) => {
      const voice = voicesRef.current.find((v) => v.id === voiceId)
      if (!voice) return
      const measure = getMeasureOrImplicit(voice, timeSignature, measureIndex)
      const accidental = resolveNoteAccidental(
        measure,
        tick,
        step,
        inputState.pendingAccidental,
        keySignature,
      )
      const event = buildNoteEvent(step, accidental, inputState)
      placeEventAtCursor(voiceId, measureIndex, tick, event)
      setActiveVoiceId(voiceId)
      setCursor({ measureIndex, tick })
      if (inputState.pendingAccidental !== null) setInputState({ pendingAccidental: null })
    },
    [timeSignature, keySignature, inputState, placeEventAtCursor, setInputState],
  )

  const toggleTieAtCursor = useCallback(() => {
    if (!activeVoiceId) return
    const voice = voicesRef.current.find((v) => v.id === activeVoiceId)
    if (!voice) return
    const existing = findEventAtTick(voice, timeSignature, cursor.measureIndex, cursor.tick)
    if (!existing || existing.kind !== "note") return
    placeEventAtCursor(activeVoiceId, cursor.measureIndex, cursor.tick, {
      ...existing,
      tiedToNext: !existing.tiedToNext,
    })
  }, [activeVoiceId, timeSignature, cursor, placeEventAtCursor])

  const moveCursor = useCallback((pos: CursorPos) => {
    setHasEditFocus(true)
    setCursor(pos)
  }, [])
  const moveCursorNext = useCallback(() => {
    if (!activeVoice) return
    setHasEditFocus(true)
    setCursor((c) => nextEventBoundary(activeVoice, timeSignature, measureCount, c))
  }, [activeVoice, timeSignature, measureCount])
  const moveCursorPrev = useCallback(() => {
    if (!activeVoice) return
    setHasEditFocus(true)
    setCursor((c) => prevEventBoundary(activeVoice, timeSignature, measureCount, c))
  }, [activeVoice, timeSignature, measureCount])

  const selectVoiceOffset = useCallback(
    (delta: number) => {
      setHasEditFocus(true)
      setActiveVoiceId((current) => {
        const list = voicesRef.current
        const idx = list.findIndex((v) => v.id === current)
        if (idx === -1) return current
        const next = Math.max(0, Math.min(list.length - 1, idx + delta))
        return list[next]?.id ?? current
      })
    },
    [],
  )

  useNoteEntryKeybinds({
    voices,
    activeVoiceId,
    cursor,
    measureCount,
    timeSignature,
    keySignature,
    inputState,
    onInputStateChange: setInputState,
    onPlaceEvent: placeEventAtCursor,
    onDeleteAtCursor: deleteAtCursor,
    onToggleTieAtCursor: toggleTieAtCursor,
    onMoveCursor: moveCursor,
    onMoveCursorNext: moveCursorNext,
    onMoveCursorPrev: moveCursorPrev,
    onSelectVoiceOffset: selectVoiceOffset,
    onTogglePlay: handleTogglePlay,
    onStop: handleStop,
    onUndo: undo,
    onRedo: redo,
  })

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
              beatsPerMeasure={beatsPerMeasure}
              timeSignature={timeSignature}
              canDeleteMeasure={measureCount > MIN_MEASURES}
              selectedMeasure={selectedMeasure}
              songName={songName}
              musicalKey={musicalKey}
              cursor={cursor}
              hasEditFocus={hasEditFocus}
              inputState={inputState}
              tieAtCursor={tieAtCursor}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              onSongNameChange={setSongName}
              onUpdateVoice={handleUpdateVoice}
              onSelectVoice={setActiveVoiceId}
              onSelectMeasure={setSelectedMeasure}
              onAddMeasures={handleAddMeasures}
              onDeleteMeasure={handleDeleteMeasure}
              onSetOctaveShift={handleSetOctaveShift}
              onSeek={seek}
              onLoopChange={handleLoopChange}
              onInputStateChange={setInputState}
              onToggleTie={toggleTieAtCursor}
              onUndo={undo}
              onRedo={redo}
              onPlaceNoteAtClick={placeNoteAtClick}
            />
          </div>

          <RightPanel
            voices={voices}
            activeVoiceId={activeVoiceId}
            isPlaying={isPlaying}
            onSelectVoice={handleSelectVoiceFromPanel}
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
