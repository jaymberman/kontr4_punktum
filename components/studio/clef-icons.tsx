import { CLEF_LINE_OFFSET, type ClefType } from "@/components/studio/types"

/**
 * Real engraved clef glyphs from the Unicode Musical Symbols block
 * (U+1D100–U+1D1FF), rendered with the Noto Music font — not hand-drawn
 * SVG paths. Noto Music is purpose-built to render this block with
 * correct, professional glyph shapes.
 */
const CLEF_CHAR: Record<ClefType, string> = {
  treble: "\u{1D11E}", // MUSICAL SYMBOL G CLEF
  bass: "\u{1D122}", // MUSICAL SYMBOL F CLEF
  alto: "\u{1D121}", // MUSICAL SYMBOL C CLEF
  tenor: "\u{1D121}", // MUSICAL SYMBOL C CLEF
}

/**
 * Each glyph's ink sits at a different position relative to the font's
 * em box, so both the font size (relative to the staff's line gap) and
 * the vertical nudge (in line-gap units, applied on top of
 * CLEF_LINE_OFFSET) are calibrated per clef so the glyph's defining
 * feature lands on its target staff line.
 */
const CLEF_METRICS: Record<ClefType, { sizeInLines: number; nudge: number }> = {
  treble: { sizeInLines: 4.3, nudge: -0.69 },
  bass: { sizeInLines: 4.04, nudge: 0.61 },
  alto: { sizeInLines: 3.87, nudge: 0.02 },
  tenor: { sizeInLines: 3.87, nudge: 0.02 },
}

export function ClefGlyph({
  clef,
  lineGap,
  className,
}: {
  clef: ClefType
  lineGap: number
  className?: string
}) {
  const metrics = CLEF_METRICS[clef]
  const offsetPx = (CLEF_LINE_OFFSET[clef] + metrics.nudge) * lineGap

  return (
    <span
      aria-hidden
      className={`font-music absolute left-1/2 top-1/2 select-none leading-none ${className ?? ""}`}
      style={{
        fontSize: metrics.sizeInLines * lineGap,
        transform: `translate(-50%, -50%) translateY(${offsetPx}px)`,
      }}
    >
      {CLEF_CHAR[clef]}
    </span>
  )
}
