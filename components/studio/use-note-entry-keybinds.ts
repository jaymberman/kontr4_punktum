"use client"

import { useEffect, useRef } from "react"
import type {
  KeySignatureSpec,
  NoteEvent,
  NoteInputState,
  TimeSignature,
  Voice,
} from "@/components/studio/types"
import {
  buildNoteEvent,
  buildRestEvent,
  eventTicks,
  findEventAtTick,
  flattenVoice,
  getMeasureOrImplicit,
  measureTicks,
  resolveNoteAccidental,
  type CursorPos,
} from "@/components/studio/rhythm"
import {
  CLEF_MIDDLE_LINE_PITCH,
  LETTER_TO_INDEX,
  nearestStepForLetter,
  nudgeChromatic,
  spelledPitchToMidi,
} from "@/components/studio/staff-geometry"

const DURATION_FOR_DIGIT: Record<string, NoteInputState["duration"]> = {
  "1": "whole",
  "2": "half",
  "3": "quarter",
  "4": "8th",
  "5": "16th",
  "6": "32nd",
}

export interface UseNoteEntryKeybindsArgs {
  voices: Voice[]
  activeVoiceId: string | null
  cursor: CursorPos
  measureCount: number
  timeSignature: TimeSignature
  keySignature: KeySignatureSpec
  inputState: NoteInputState
  onInputStateChange: (patch: Partial<NoteInputState>) => void
  onPlaceEvent: (voiceId: string, measureIndex: number, tick: number, event: NoteEvent) => void
  onDeleteAtCursor: () => void
  onToggleTieAtCursor: () => void
  onMoveCursor: (pos: CursorPos) => void
  onMoveCursorNext: () => void
  onMoveCursorPrev: () => void
  onSelectVoiceOffset: (delta: number) => void
  onTogglePlay: () => void
  onStop: () => void
  onUndo: () => void
  onRedo: () => void
}

function isTextEntryTarget(el: Element | null): boolean {
  if (!el) return false
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true
  return (el as HTMLElement).isContentEditable === true
}

/** Nearest sounding pitch (skipping rests) strictly before the cursor, or the clef's own anchor if the voice is empty so far. */
function findAnchorPitch(a: UseNoteEntryKeybindsArgs, voice: Voice): number {
  const flat = flattenVoice(voice, a.timeSignature, a.measureCount)
  const globalTick = a.cursor.measureIndex * measureTicks(a.timeSignature) + a.cursor.tick
  let anchor: number | null = null
  for (const f of flat) {
    if (f.startTick >= globalTick) break
    if (f.event.kind === "note") anchor = spelledPitchToMidi(f.event.step, f.event.accidental)
  }
  return anchor ?? CLEF_MIDDLE_LINE_PITCH[voice.clef]
}

function advanceCursor(a: UseNoteEntryKeybindsArgs, ticksAdvanced: number) {
  const mTicks = measureTicks(a.timeSignature)
  const rawNextTick = a.cursor.tick + ticksAdvanced
  if (rawNextTick >= mTicks) {
    const nextMeasure = a.cursor.measureIndex + 1
    // Out of room to advance into (no more measures) — leave the cursor
    // where the just-placed event starts rather than risk pointing past
    // the end of the score.
    if (nextMeasure >= a.measureCount) return
    a.onMoveCursor({ measureIndex: nextMeasure, tick: 0 })
  } else {
    a.onMoveCursor({ measureIndex: a.cursor.measureIndex, tick: rawNextTick })
  }
}

/**
 * Global step-time note entry: a single always-on `window` keydown
 * listener implementing the approved baseline keymap (letters=pitch,
 * digits=duration, arrows=nudge/navigate, etc). Nothing else in the app
 * does global keyboard handling — Space/Escape for transport are wired
 * here too, since no other code binds them.
 *
 * Reads the latest args through a ref rather than re-subscribing on every
 * render (this tree re-renders on every keystroke), so the listener
 * itself is only attached once per mount.
 */
export function useNoteEntryKeybinds(args: UseNoteEntryKeybindsArgs) {
  const argsRef = useRef(args)
  useEffect(() => {
    argsRef.current = args
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTextEntryTarget(document.activeElement)) return

      const a = argsRef.current
      const key = e.key
      const mod = e.metaKey || e.ctrlKey

      if (mod && (key === "z" || key === "Z")) {
        e.preventDefault()
        if (e.shiftKey) a.onRedo()
        else a.onUndo()
        return
      }
      if (mod && (key === "y" || key === "Y")) {
        e.preventDefault()
        a.onRedo()
        return
      }
      // Don't intercept any other browser/OS modifier shortcuts.
      if (mod) return

      if (key === " ") {
        e.preventDefault()
        a.onTogglePlay()
        return
      }
      if (key === "Escape") {
        a.onStop()
        return
      }
      if (key === "Tab") {
        e.preventDefault()
        a.onSelectVoiceOffset(e.shiftKey ? -1 : 1)
        return
      }

      const activeVoice = a.voices.find((v) => v.id === a.activeVoiceId)
      if (!activeVoice) return

      if (key === "ArrowLeft") {
        a.onMoveCursorPrev()
        return
      }
      if (key === "ArrowRight") {
        a.onMoveCursorNext()
        return
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        const event = findEventAtTick(activeVoice, a.timeSignature, a.cursor.measureIndex, a.cursor.tick)
        if (!event || event.kind !== "note") return
        const direction: 1 | -1 = key === "ArrowUp" ? 1 : -1
        if (e.shiftKey) {
          a.onPlaceEvent(activeVoice.id, a.cursor.measureIndex, a.cursor.tick, {
            ...event,
            step: event.step + 7 * direction,
          })
        } else {
          const { step, accidental } = nudgeChromatic(event.step, event.accidental, direction)
          a.onPlaceEvent(activeVoice.id, a.cursor.measureIndex, a.cursor.tick, { ...event, step, accidental })
        }
        return
      }

      if (key === "Delete" || key === "Backspace") {
        a.onDeleteAtCursor()
        return
      }
      if (key === "t" || key === "T") {
        a.onToggleTieAtCursor()
        return
      }
      if (key === ".") {
        a.onInputStateChange({ dotted: !a.inputState.dotted })
        return
      }
      if (key === "-" || key === "_") {
        a.onInputStateChange({ pendingAccidental: "flat" })
        return
      }
      if (key === "=" || key === "+") {
        a.onInputStateChange({ pendingAccidental: "sharp" })
        return
      }
      if (key === "0") {
        a.onInputStateChange({ pendingAccidental: "natural" })
        return
      }
      if (DURATION_FOR_DIGIT[key]) {
        a.onInputStateChange({ duration: DURATION_FOR_DIGIT[key] })
        return
      }
      if (key === "r" || key === "R") {
        const rest = buildRestEvent(a.inputState)
        a.onPlaceEvent(activeVoice.id, a.cursor.measureIndex, a.cursor.tick, rest)
        advanceCursor(a, eventTicks(rest))
        return
      }

      const letterIndex = LETTER_TO_INDEX[key.toUpperCase()]
      if (letterIndex !== undefined) {
        const anchor = findAnchorPitch(a, activeVoice)
        const step = nearestStepForLetter(letterIndex, anchor)
        const measure = getMeasureOrImplicit(activeVoice, a.timeSignature, a.cursor.measureIndex)
        const accidental = resolveNoteAccidental(
          measure,
          a.cursor.tick,
          step,
          a.inputState.pendingAccidental,
          a.keySignature,
        )
        const event = buildNoteEvent(step, accidental, a.inputState)
        a.onPlaceEvent(activeVoice.id, a.cursor.measureIndex, a.cursor.tick, event)
        advanceCursor(a, eventTicks(event))
        if (a.inputState.pendingAccidental !== null) a.onInputStateChange({ pendingAccidental: null })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}
