import { KEY_SIGNATURES, type ClefType } from "@/components/studio/types"
import { staffPosToY } from "@/components/studio/staff-geometry"

/**
 * Key signatures, engraved the way real scores do it.
 *
 * Two rules govern a key signature, and both are encoded here:
 *
 * 1. ORDER. Accidentals are always written in a fixed sequence, never
 *    sorted by pitch: sharps go F C G D A E B, flats go the reverse,
 *    B E A D G C F. A key with three sharps therefore shows F, C, G.
 *
 * 2. POSITION. Each accidental has one conventional line or space per
 *    clef. The sequence zigzags (up a fourth, down a fifth) so it stays
 *    on or near the staff rather than marching off the top.
 *
 * The positions below are the standard engraved placements rather than a
 * computed transposition, because clefs are not simple offsets of one
 * another: tenor clef in particular breaks the pattern, placing its first
 * sharp low and ascending from there so the group stays on the staff.
 */

/** Sharp order: F C G D A E B. */
const SHARP_POSITIONS: Record<ClefType, number[]> = {
  // F5 top line, C5, G5 above the staff, D5, A4, E5, B4
  treble: [4, 1, 5, 2, -1, 3, 0],
  // F4, C4 middle line, G4 top line, D4, A3, E4, B3
  alto: [3, 0, 4, 1, -2, 2, -1],
  // Tenor's exception: F3 sits low so the rest can ascend on the staff.
  tenor: [-2, 2, -1, 3, 0, 4, 1],
  // F3 fourth line, C3, G3, D3 middle line, A2, E3, B2
  bass: [2, -1, 3, 0, -3, 1, -2],
}

/** Flat order: B E A D G C F. */
const FLAT_POSITIONS: Record<ClefType, number[]> = {
  // B4 middle line, E5, A4, D5, G4, C5, F4
  treble: [0, 3, -1, 2, -2, 1, -3],
  // B3, E4, A3, D4, G3, C4 middle line, F3 bottom line
  alto: [-1, 2, -2, 1, -3, 0, -4],
  // B3, E4 top line, A3 middle line, D4, G3, C4, F3
  tenor: [1, 4, 0, 3, -1, 2, -2],
  // B2, E3, A2, D3 middle line, G2 bottom line, C3, F2 below the staff
  bass: [-2, 1, -3, 0, -4, -1, -5],
}

/** U+266F MUSIC SHARP SIGN / U+266D MUSIC FLAT SIGN, from Noto Music. */
const SHARP_CHAR = "\u266F"
const FLAT_CHAR = "\u266D"

/**
 * Per-accidental glyph metrics, needed because an accidental does not mark
 * the pitch at the middle of its glyph box.
 *
 * What identifies the pitch is one specific feature of the ink: the bowl
 * of a flat, and the midpoint between the two crossbars of a sharp. In
 * Noto Music neither feature is centered in the glyph's line box — the
 * flat's tall ascending stem and the sharp's long verticals both pull the
 * box upward, leaving the marking feature well below center.
 *
 * `featureOffsetEm` is how far below the line-box center that feature
 * renders, in em, measured by rasterizing each glyph and scanning its ink
 * rows. Positioning code subtracts it so the feature — not the box —
 * lands on the intended line or space. Without this correction every
 * accidental sits about one full line-gap low, i.e. a third flat.
 */
const GLYPH_METRICS = {
  sharp: { char: SHARP_CHAR, sizeInLines: 2.5, featureOffsetEm: 0.3625 },
  flat: { char: FLAT_CHAR, sizeInLines: 2.9, featureOffsetEm: 0.3275 },
} as const

/**
 * Horizontal step between accidentals, in line-gap units. Real engraving
 * packs them just under one staff space apart so the group reads as a
 * single unit rather than seven separate marks.
 */
const STEP_IN_LINES = 0.82

/** Breathing room after the clef and before the first note column. */
const LEAD_IN_LINES = 0.35
const TRAIL_IN_LINES = 0.7

/**
 * Total width the signature occupies. Returns 0 for keys with no
 * accidentals (C major / A minor) so those scores get no dead gap
 * between the clef and the first note.
 */
export function keySignatureWidth(
  musicalKey: string,
  lineGap: number,
): number {
  const sig = KEY_SIGNATURES[musicalKey]
  if (!sig || sig.count === 0) return 0
  return (
    (LEAD_IN_LINES + sig.count * STEP_IN_LINES + TRAIL_IN_LINES) * lineGap
  )
}

export function KeySignature({
  musicalKey,
  clef,
  lineGap,
}: {
  musicalKey: string
  clef: ClefType
  lineGap: number
}) {
  const sig = KEY_SIGNATURES[musicalKey]
  if (!sig || sig.count === 0) return null

  const isSharp = sig.type === "sharp"
  const positions = (isSharp ? SHARP_POSITIONS : FLAT_POSITIONS)[clef].slice(
    0,
    sig.count,
  )
  const metrics = GLYPH_METRICS[isSharp ? "sharp" : "flat"]
  // Derived from the font size rather than hardcoded, so changing the
  // glyph size cannot silently reintroduce the misalignment.
  const featureNudge =
    metrics.featureOffsetEm * metrics.sizeInLines * lineGap

  return (
    <div
      className="pointer-events-none absolute inset-y-0"
      style={{ width: keySignatureWidth(musicalKey, lineGap) }}
      role="img"
      aria-label={`Key signature: ${sig.count} ${
        isSharp ? "sharp" : "flat"
      }${sig.count === 1 ? "" : "s"}`}
    >
      {positions.map((staffPos, i) => (
        <span
          key={i}
          aria-hidden
          className="font-music absolute select-none leading-none"
          style={{
            left: (LEAD_IN_LINES + i * STEP_IN_LINES) * lineGap,
            top: "50%",
            fontSize: metrics.sizeInLines * lineGap,
            // Place the glyph's marking feature — not its box — on the
            // target line, using the same geometry the note heads use so a
            // signature accidental and a note on that line agree exactly.
            // The feature sits below the box center, so it is lifted back
            // up by that measured amount.
            transform: `translateY(calc(-50% + ${
              staffPosToY(staffPos, lineGap) - featureNudge
            }px))`,
          }}
        >
          {metrics.char}
        </span>
      ))}
    </div>
  )
}
