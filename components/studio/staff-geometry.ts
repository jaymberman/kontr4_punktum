import type { AccidentalId, ClefType } from "@/components/studio/types"

/**
 * Staff geometry: the single source of truth that maps musical pitch to
 * vertical position on a staff, and back again.
 *
 * A staff is *diatonic*, not chromatic. Every line and every space is one
 * letter name (C, D, E, F, G, A, B) — never a fixed number of semitones.
 * So all vertical math is done in "staff positions": integer steps where
 * one step = one line-to-adjacent-space move.
 *
 *   staffPos  0 = the middle line
 *   staffPos +1 = the space just above it (higher pitch)
 *   staffPos -1 = the space just below it (lower pitch)
 *
 * Even positions are lines, odd positions are spaces. The five staff lines
 * are therefore at -4, -2, 0, +2, +4.
 */

/** Pixel height of one staff position (half the line-to-line gap). */
export const stepPx = (lineGap: number) => lineGap / 2

/** Staff positions of the five printed staff lines, bottom line first. */
export const STAFF_LINE_POSITIONS = [-4, -2, 0, 2, 4] as const

export const TOP_STAFF_LINE = 4
export const BOTTOM_STAFF_LINE = -4

/**
 * Furthest position reachable by clicking or arrow keys. Ledger lines sit
 * at +/-6 and +/-8, so 8 is exactly two ledger lines above and below the
 * staff. Stopping here rather than at the space beyond keeps rows compact
 * while still covering the full two-ledger range.
 */
export const MAX_STAFF_POS = 8

/** Semitone offset above C for each diatonic letter: C D E F G A B. */
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11]

/** Letter index for each of the 12 pitch classes (sharps share a letter). */
const PITCH_CLASS_TO_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]

/** True when the pitch class is a black key, i.e. needs an accidental. */
const PITCH_CLASS_IS_ALTERED = [
  false, true, false, true, false,
  false, true, false, true, false, true, false,
]

export const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "B"]

/** Letter name → index into LETTER_NAMES, for keyboard note entry (A-G keys). */
export const LETTER_TO_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
}

/** Semitone offset an accidental applies to its letter's natural pitch. */
export const ACCIDENTAL_OFFSET: Record<AccidentalId, number> = {
  "double-flat": -2,
  flat: -1,
  natural: 0,
  sharp: 1,
  "double-sharp": 2,
}

/**
 * Absolute diatonic step number for a MIDI pitch — how many letter names
 * it sits above C(-1). This is the value that maps linearly onto a staff.
 */
export function diatonicStep(pitch: number): number {
  const octave = Math.floor(pitch / 12)
  const pitchClass = ((pitch % 12) + 12) % 12
  return octave * 7 + PITCH_CLASS_TO_LETTER[pitchClass]
}

/** Inverse of diatonicStep, resolving to the natural (unaltered) pitch. */
export function pitchFromDiatonicStep(step: number): number {
  const octave = Math.floor(step / 7)
  const letter = ((step % 7) + 7) % 7
  return octave * 12 + LETTER_SEMITONES[letter]
}

/** Letter index (0=C..6=B) of a diatonic step, independent of octave. */
export function letterIndexOfStep(step: number): number {
  return ((step % 7) + 7) % 7
}

/** Which octave (in diatonicStep's octave numbering) a step falls in. */
export function octaveOfStep(step: number): number {
  return Math.floor(step / 7)
}

/**
 * The actual sounding MIDI pitch of a written note: its natural letter
 * pitch, adjusted by its explicit accidental (or unadjusted if natural).
 */
export function spelledPitchToMidi(
  step: number,
  accidental: AccidentalId | null,
): number {
  return pitchFromDiatonicStep(step) + (accidental ? ACCIDENTAL_OFFSET[accidental] : 0)
}

/**
 * The step (of the given letter) whose natural pitch sits closest to an
 * anchor pitch. Used by step-time keyboard entry to pick a sensible octave
 * when the user types a bare letter — e.g. typing "C" near a preceding B4
 * should land on C5, not some arbitrary default octave.
 */
export function nearestStepForLetter(letterIndex: number, anchorPitch: number): number {
  const anchorOctave = Math.floor(anchorPitch / 12)
  let best = anchorOctave * 7 + letterIndex
  let bestDist = Infinity
  for (let octave = anchorOctave - 1; octave <= anchorOctave + 1; octave++) {
    const step = octave * 7 + letterIndex
    const dist = Math.abs(pitchFromDiatonicStep(step) - anchorPitch)
    if (dist < bestDist) {
      bestDist = dist
      best = step
    }
  }
  return best
}

const ACCIDENTAL_BY_OFFSET: Record<number, AccidentalId | null> = {
  [-2]: "double-flat",
  [-1]: "flat",
  [0]: null,
  [1]: "sharp",
  [2]: "double-sharp",
}

/**
 * Chromatic semitone nudge: re-spells the same letter via a different
 * accidental when possible (C -> C♯), and only steps to the adjacent
 * letter when the target pitch can't be reached by any accidental on the
 * current one (C♯♯ -> D, not some invalid triple-sharp).
 */
export function nudgeChromatic(
  step: number,
  accidental: AccidentalId | null,
  direction: 1 | -1,
): { step: number; accidental: AccidentalId | null } {
  const target = spelledPitchToMidi(step, accidental) + direction
  for (let letterStep = step; Math.abs(letterStep - step) <= 2; letterStep += direction) {
    const offset = target - pitchFromDiatonicStep(letterStep)
    if (offset >= -2 && offset <= 2) {
      return { step: letterStep, accidental: ACCIDENTAL_BY_OFFSET[offset] }
    }
  }
  return { step: step + direction, accidental: null }
}

/**
 * The pitch that sits on each clef's middle line. This is what actually
 * defines a clef: treble puts B4 there, bass D3, alto C4, tenor A3
 * (because tenor's C4 sits on the fourth line, two steps higher).
 */
export const CLEF_MIDDLE_LINE_PITCH: Record<ClefType, number> = {
  treble: 71, // B4
  alto: 60, // C4
  tenor: 57, // A3
  bass: 50, // D3
}

/** Staff position for a pitch in a given clef. */
export function pitchToStaffPos(pitch: number, clef: ClefType): number {
  return diatonicStep(pitch) - diatonicStep(CLEF_MIDDLE_LINE_PITCH[clef])
}

/** Natural pitch that occupies a given staff position in a given clef. */
export function staffPosToPitch(staffPos: number, clef: ClefType): number {
  return pitchFromDiatonicStep(
    diatonicStep(CLEF_MIDDLE_LINE_PITCH[clef]) + staffPos,
  )
}

/** Diatonic step (letter+octave, accidental-independent) at a staff position. */
export function staffPosToStep(staffPos: number, clef: ClefType): number {
  return diatonicStep(CLEF_MIDDLE_LINE_PITCH[clef]) + staffPos
}

/** Inverse of staffPosToStep — where a written step sits on this clef's staff. */
export function stepToStaffPos(step: number, clef: ClefType): number {
  return step - diatonicStep(CLEF_MIDDLE_LINE_PITCH[clef])
}

/** Vertical pixel offset from the staff's middle line. Up is negative. */
export function staffPosToY(staffPos: number, lineGap: number): number {
  return -staffPos * stepPx(lineGap)
}

/**
 * Snap an arbitrary pixel offset (measured from the middle line) to the
 * nearest line or space. This is what makes a click land on real notation
 * instead of an estimated spot on a picture.
 */
export function yToStaffPos(y: number, lineGap: number): number {
  const raw = Math.round(-y / stepPx(lineGap))
  return Math.max(-MAX_STAFF_POS, Math.min(MAX_STAFF_POS, raw))
}

export const isLinePosition = (staffPos: number) => staffPos % 2 === 0

export const isOnStaff = (staffPos: number) =>
  staffPos >= BOTTOM_STAFF_LINE && staffPos <= TOP_STAFF_LINE

/**
 * Ledger lines required to notate a position above/below the staff. A note
 * at or beyond the first ledger position gets a line for every *line*
 * position between the staff edge and the note.
 */
export function ledgerLinePositions(staffPos: number): number[] {
  const lines: number[] = []
  if (staffPos > TOP_STAFF_LINE) {
    for (let p = TOP_STAFF_LINE + 2; p <= staffPos; p += 2) lines.push(p)
  } else if (staffPos < BOTTOM_STAFF_LINE) {
    for (let p = BOTTOM_STAFF_LINE - 2; p >= staffPos; p -= 2) lines.push(p)
  }
  return lines
}

/** Human-readable pitch name, e.g. "F♯4" — used for labels and a11y. */
export function pitchName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1
  const pitchClass = ((pitch % 12) + 12) % 12
  const letter = LETTER_NAMES[PITCH_CLASS_TO_LETTER[pitchClass]]
  const accidental = PITCH_CLASS_IS_ALTERED[pitchClass] ? "\u266F" : ""
  return `${letter}${accidental}${octave}`
}

/** Describes a position as notation would: "on the 2nd line", etc. */
export function staffPosDescription(staffPos: number): string {
  const ordinal = (n: number) => {
    const suffixes = ["th", "st", "nd", "rd"]
    const v = n % 100
    return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0])
  }
  if (isOnStaff(staffPos)) {
    if (isLinePosition(staffPos)) {
      return `on the ${ordinal((staffPos - BOTTOM_STAFF_LINE) / 2 + 1)} line`
    }
    return `in the ${ordinal((staffPos - BOTTOM_STAFF_LINE + 1) / 2)} space`
  }
  const side = staffPos > 0 ? "above" : "below"
  const distance = Math.abs(staffPos)
  // The first position off the staff is a space, needing no ledger line.
  if (distance === TOP_STAFF_LINE + 1) {
    return `in the space ${side} the staff`
  }
  const count = Math.floor((distance - TOP_STAFF_LINE) / 2)
  return isLinePosition(staffPos)
    ? `on ledger line ${count} ${side} the staff`
    : `in the space ${side} ledger line ${count}`
}
