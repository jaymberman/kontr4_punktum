import {
  keySignatureAccidentalForLetter,
  type AccidentalId,
  type KeySignatureSpec,
  type Measure,
  type NoteDurationId,
  type NoteEvent,
  type NoteInputState,
  type TimeSignature,
  type Voice,
} from "@/components/studio/types"
import { letterIndexOfStep, octaveOfStep } from "@/components/studio/staff-geometry"

/**
 * Rhythm/tick math: the single source of truth for converting between note
 * durations, measure-relative tick offsets, and the shared editing
 * primitive (`placeEvent`) that both mouse click-to-place and keyboard
 * step-time entry funnel through.
 *
 * 96 ticks per quarter note divides cleanly all the way down to a
 * dotted-32nd (18 ticks) with no floating point drift.
 */
export const TICKS_PER_QUARTER = 96

export const DURATION_TICKS: Record<NoteDurationId, number> = {
  whole: TICKS_PER_QUARTER * 4,
  half: TICKS_PER_QUARTER * 2,
  quarter: TICKS_PER_QUARTER,
  "8th": TICKS_PER_QUARTER / 2,
  "16th": TICKS_PER_QUARTER / 4,
  "32nd": TICKS_PER_QUARTER / 8,
}

const DURATIONS_LONGEST_FIRST: NoteDurationId[] = ["whole", "half", "quarter", "8th", "16th", "32nd"]

export function eventTicks(event: Pick<NoteEvent, "duration" | "dotted">): number {
  const base = DURATION_TICKS[event.duration]
  return event.dotted ? base * 1.5 : base
}

/**
 * Time signature is global (one Meter select, no per-measure meter
 * changes), so a measure's total tick length is a single constant derived
 * from it — this is what finally makes the Meter dropdown mean something.
 */
export function measureTicks(ts: TimeSignature): number {
  return ts.numerator * ((TICKS_PER_QUARTER * 4) / ts.denominator)
}

/** May be fractional (9/8 -> 4.5) — playheadBeat is already a continuous float. */
export function beatsPerMeasure(ts: TimeSignature): number {
  return measureTicks(ts) / TICKS_PER_QUARTER
}

let idCounter = 0
export function makeEventId(): string {
  idCounter += 1
  return `evt-${Date.now()}-${idCounter}`
}

/**
 * Decomposes a tick span into rest events via greedy largest-fit — not
 * necessarily the "prettiest" rest spelling a human engraver would choose,
 * but deterministic and always ties-out to the exact tick count.
 */
export function splitTicksIntoRestEvents(ticks: number): NoteEvent[] {
  const events: NoteEvent[] = []
  let remaining = Math.round(ticks)
  while (remaining > 0) {
    const duration = DURATIONS_LONGEST_FIRST.find((d) => DURATION_TICKS[d] <= remaining)
    if (!duration) break
    events.push({ kind: "rest", id: makeEventId(), duration, dotted: false })
    remaining -= DURATION_TICKS[duration]
  }
  return events
}

/** A measure with no explicit data yet — the "grow for free" convention. */
export function implicitMeasure(ts: TimeSignature): Measure {
  return { events: splitTicksIntoRestEvents(measureTicks(ts)) }
}

export function getMeasureOrImplicit(voice: Voice, ts: TimeSignature, measureIndex: number): Measure {
  return voice.measures[measureIndex] ?? implicitMeasure(ts)
}

/**
 * The single core editing primitive: places `newEvent` at `tickOffset`
 * within a measure, removing/backfilling whatever it overlaps. Reused by
 * mouse click-to-place, keyboard step-time entry, and Delete (which places
 * a same-span rest) — this is what keeps every input method consistent.
 */
export function placeEvent(measure: Measure, ts: TimeSignature, tickOffset: number, newEvent: NoteEvent): Measure {
  const total = measureTicks(ts)
  const newTicks = eventTicks(newEvent)
  const endTick = tickOffset + newTicks

  if (process.env.NODE_ENV !== "production" && (tickOffset < 0 || endTick > total + 0.001)) {
    throw new Error(`placeEvent: span [${tickOffset}, ${endTick}) exceeds measure (${total} ticks)`)
  }

  const before: NoteEvent[] = []
  const after: NoteEvent[] = []
  let removedSpanStart = tickOffset
  let removedSpanEnd = endTick
  let cursor = 0

  for (const event of measure.events) {
    const evStart = cursor
    const evEnd = cursor + eventTicks(event)
    cursor = evEnd
    if (evEnd <= tickOffset) {
      before.push(event)
    } else if (evStart >= endTick) {
      after.push(event)
    } else {
      removedSpanStart = Math.min(removedSpanStart, evStart)
      removedSpanEnd = Math.max(removedSpanEnd, evEnd)
    }
  }

  const events = [
    ...before,
    ...splitTicksIntoRestEvents(tickOffset - removedSpanStart),
    newEvent,
    ...splitTicksIntoRestEvents(removedSpanEnd - endTick),
    ...after,
  ]

  if (process.env.NODE_ENV !== "production") {
    const sum = events.reduce((s, e) => s + eventTicks(e), 0)
    if (Math.round(sum) !== Math.round(total)) {
      throw new Error(`placeEvent: measure ticks mismatch (${sum} != ${total})`)
    }
  }

  return { events }
}

/**
 * Applies `updater` to a voice's measure at `measureIndex`, materializing
 * any implicit (not-yet-stored) measures up to and including it first.
 * This is the entry point mouse/keyboard editing should call — it's what
 * keeps `handleAddMeasures` a no-op (measures stay implicit until touched).
 */
export function updateVoiceMeasure(
  voice: Voice,
  ts: TimeSignature,
  measureIndex: number,
  updater: (measure: Measure) => Measure,
): Voice {
  const measures = [...voice.measures]
  while (measures.length <= measureIndex) {
    measures.push(implicitMeasure(ts))
  }
  measures[measureIndex] = updater(measures[measureIndex])
  return { ...voice, measures }
}

/** Notes/rests still stored in a measure strictly before a given tick. */
export function priorEventsBeforeTick(measure: Measure, tick: number): NoteEvent[] {
  const result: NoteEvent[] = []
  let cursor = 0
  for (const event of measure.events) {
    if (cursor >= tick) break
    result.push(event)
    cursor += eventTicks(event)
  }
  return result
}

/**
 * What accidental is already "in effect" for a letter+octave at a given
 * point in a measure: either an explicit accidental applied earlier in
 * this measure to that same letter+octave, or (if none yet) whatever the
 * active key signature implies for that letter. Shared by note entry
 * (to resolve the default accidental for a plain letter keystroke) and by
 * the renderer (to decide whether a note's stored accidental needs its own
 * glyph, or already matches what's in effect).
 */
export function resolveInEffectAccidental(
  priorEvents: NoteEvent[],
  letterIndex: number,
  octave: number,
  keySignature: KeySignatureSpec,
): AccidentalId | null {
  for (let i = priorEvents.length - 1; i >= 0; i--) {
    const event = priorEvents[i]
    if (event.kind !== "note") continue
    if (letterIndexOfStep(event.step) === letterIndex && octaveOfStep(event.step) === octave) {
      return event.accidental
    }
  }
  return keySignatureAccidentalForLetter(letterIndex, keySignature)
}

/**
 * The accidental a *new* note should actually get: an explicitly chosen
 * one takes precedence, otherwise it falls back to whatever's in effect
 * (key signature, adjusted by any earlier accidental this measure). Shared
 * by mouse click-to-place and keyboard letter entry so both resolve a
 * plain input the same way.
 */
export function resolveNoteAccidental(
  measure: Measure,
  tick: number,
  step: number,
  pendingAccidental: AccidentalId | null,
  keySignature: KeySignatureSpec,
): AccidentalId | null {
  if (pendingAccidental !== null) return pendingAccidental
  return resolveInEffectAccidental(
    priorEventsBeforeTick(measure, tick),
    letterIndexOfStep(step),
    octaveOfStep(step),
    keySignature,
  )
}

export function buildNoteEvent(
  step: number,
  accidental: AccidentalId | null,
  input: NoteInputState,
): NoteEvent {
  return {
    kind: "note",
    id: makeEventId(),
    step,
    accidental,
    duration: input.duration,
    dotted: input.dotted,
    tiedToNext: false,
  }
}

export function buildRestEvent(input: NoteInputState): NoteEvent {
  return { kind: "rest", id: makeEventId(), duration: input.duration, dotted: input.dotted }
}

export interface CursorPos {
  measureIndex: number
  tick: number
}

function cmpPos(a: CursorPos, b: CursorPos): number {
  return a.measureIndex !== b.measureIndex ? a.measureIndex - b.measureIndex : a.tick - b.tick
}

/** Every event-start position across a voice's (possibly implicit) measures. */
export function eventBoundaries(voice: Voice, ts: TimeSignature, measureCount: number): CursorPos[] {
  const boundaries: CursorPos[] = []
  for (let m = 0; m < measureCount; m++) {
    let cursor = 0
    for (const event of getMeasureOrImplicit(voice, ts, m).events) {
      boundaries.push({ measureIndex: m, tick: cursor })
      cursor += eventTicks(event)
    }
  }
  return boundaries
}

export function nextEventBoundary(
  voice: Voice,
  ts: TimeSignature,
  measureCount: number,
  pos: CursorPos,
): CursorPos {
  const boundaries = eventBoundaries(voice, ts, measureCount)
  const idx = boundaries.findIndex((b) => cmpPos(b, pos) === 0)
  if (idx === -1 || idx === boundaries.length - 1) return pos
  return boundaries[idx + 1]
}

export function prevEventBoundary(
  voice: Voice,
  ts: TimeSignature,
  measureCount: number,
  pos: CursorPos,
): CursorPos {
  const boundaries = eventBoundaries(voice, ts, measureCount)
  const idx = boundaries.findIndex((b) => cmpPos(b, pos) === 0)
  if (idx <= 0) return pos
  return boundaries[idx - 1]
}

export function findEventAtTick(voice: Voice, ts: TimeSignature, measureIndex: number, tick: number): NoteEvent | undefined {
  const measure = getMeasureOrImplicit(voice, ts, measureIndex)
  let cursor = 0
  for (const event of measure.events) {
    if (cursor === tick) return event
    cursor += eventTicks(event)
  }
  return undefined
}

export interface BeamGroup {
  /** Indices into the measure's `events` array, in order, length >= 2. */
  eventIndices: number[]
}

const BEAMABLE_MAX_TICKS = DURATION_TICKS["8th"]

/**
 * Groups consecutive eighth-note-or-shorter events within a measure into
 * beam groups, the way real engraving does: by the quarter-note beat in
 * simple meters, or by the dotted-quarter beat in compound meters (6/8,
 * 9/8, 12/8 group in 3s, not 2s). A rest, or a note longer than an eighth,
 * breaks a group; a single beamable note with no beamable neighbor in its
 * beat gets an individual flag instead (not returned as a group).
 */
export function computeBeamGroups(events: NoteEvent[], ts: TimeSignature): BeamGroup[] {
  const isCompound = ts.denominator === 8 && ts.numerator % 3 === 0 && ts.numerator > 3
  const groupTicks = isCompound ? TICKS_PER_QUARTER * 1.5 : TICKS_PER_QUARTER

  const groups: BeamGroup[] = []
  let current: number[] = []
  let currentBeat = -1

  const flush = () => {
    if (current.length >= 2) groups.push({ eventIndices: current })
    current = []
  }

  let cursor = 0
  events.forEach((event, i) => {
    const beat = Math.floor(cursor / groupTicks)
    if (beat !== currentBeat) {
      flush()
      currentBeat = beat
    }
    const isBeamable = event.kind === "note" && DURATION_TICKS[event.duration] <= BEAMABLE_MAX_TICKS
    if (isBeamable) {
      current.push(i)
    } else {
      flush()
    }
    cursor += eventTicks(event)
  })
  flush()

  return groups
}

export interface FlatEvent {
  event: NoteEvent
  startTick: number
  ticks: number
}

/** Flattens a voice's measures into one global (piece-relative) tick timeline. */
export function flattenVoice(voice: Voice, ts: TimeSignature, measureCount: number): FlatEvent[] {
  const mTicks = measureTicks(ts)
  const flat: FlatEvent[] = []
  for (let m = 0; m < measureCount; m++) {
    let cursor = m * mTicks
    for (const event of getMeasureOrImplicit(voice, ts, m).events) {
      const ticks = eventTicks(event)
      flat.push({ event, startTick: cursor, ticks })
      cursor += ticks
    }
  }
  return flat
}

export interface SoundingSpan {
  startTick: number
  ticks: number
  step: number
  accidental: AccidentalId | null
}

/**
 * Merges consecutive tied same-pitch notes into one continuous sounding
 * span, for audio scheduling only. Ties are validated here at read-time
 * (the flag alone doesn't require a matching next note to exist) — the
 * natural workflow is "press T, then type the matching note" — so a tie
 * flag with no valid match to follow is simply ignored, not an error.
 */
export function flattenTiesToSpans(flat: FlatEvent[]): SoundingSpan[] {
  const spans: SoundingSpan[] = []
  let i = 0
  while (i < flat.length) {
    const first = flat[i]
    if (first.event.kind !== "note") {
      i++
      continue
    }
    let totalTicks = first.ticks
    let j = i
    while (true) {
      const current = flat[j].event
      const next = flat[j + 1]
      if (
        current.kind === "note" &&
        current.tiedToNext &&
        next &&
        next.event.kind === "note" &&
        next.event.step === first.event.step &&
        next.event.accidental === first.event.accidental
      ) {
        j++
        totalTicks += flat[j].ticks
      } else {
        break
      }
    }
    spans.push({
      startTick: first.startTick,
      ticks: totalTicks,
      step: first.event.step,
      accidental: first.event.accidental,
    })
    i = j + 1
  }
  return spans
}
