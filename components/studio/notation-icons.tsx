import type { AccidentalId, NoteDurationId } from "@/components/studio/types"

const FLAG_COUNT: Record<NoteDurationId, number> = {
  whole: 0,
  half: 0,
  quarter: 0,
  "8th": 1,
  "16th": 2,
  "32nd": 3,
}

/** Filled/open notehead with stem and flags, matching standard note values. */
export function NoteIcon({
  duration,
  className,
}: {
  duration: NoteDurationId
  className?: string
}) {
  const hollow = duration === "whole" || duration === "half"
  const stemless = duration === "whole"
  const flags = FLAG_COUNT[duration]

  return (
    <svg viewBox="0 0 16 22" className={className} aria-hidden fill="none">
      <ellipse
        cx="6"
        cy="16"
        rx={duration === "whole" ? 4.2 : 3}
        ry="2.5"
        transform="rotate(-20 6 16)"
        fill={hollow ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth="1.3"
      />
      {!stemless && (
        <line
          x1="9"
          y1="14.5"
          x2="9"
          y2="2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
      {Array.from({ length: flags }).map((_, i) => (
        <path
          key={i}
          d={`M9 ${2 + i * 4.2} C 13 ${3 + i * 4.2}, 13 ${6 + i * 4.2}, 9.4 ${8 + i * 4.2}`}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/**
 * Real engraved rest glyphs from the Unicode Musical Symbols block,
 * rendered with the Noto Music font — not hand-drawn approximations.
 */
const REST_CHAR: Record<NoteDurationId, string> = {
  whole: "\u{1D13B}", // MUSICAL SYMBOL WHOLE REST
  half: "\u{1D13C}", // MUSICAL SYMBOL HALF REST
  quarter: "\u{1D13D}", // MUSICAL SYMBOL QUARTER REST
  "8th": "\u{1D13E}", // MUSICAL SYMBOL EIGHTH REST
  "16th": "\u{1D13F}", // MUSICAL SYMBOL SIXTEENTH REST
  "32nd": "\u{1D140}", // MUSICAL SYMBOL THIRTY-SECOND REST
}

export function RestIcon({
  duration,
  className,
}: {
  duration: NoteDurationId
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`font-music inline-flex items-center justify-center leading-none ${className ?? "text-base"}`}
    >
      {REST_CHAR[duration]}
    </span>
  )
}

/**
 * Real engraved accidental glyphs — the standard sharp/flat/natural signs
 * come from the general Unicode Miscellaneous Symbols block, while
 * double-sharp and double-flat come from the Musical Symbols block.
 * All are rendered with the Noto Music font for a consistent, correctly
 * engraved appearance instead of hand-drawn lines.
 */
const ACCIDENTAL_CHAR: Record<AccidentalId, string> = {
  flat: "\u266D", // FLAT SIGN
  natural: "\u266E", // NATURAL SIGN
  sharp: "\u266F", // SHARP SIGN
  "double-sharp": "\u{1D12A}", // MUSICAL SYMBOL DOUBLE SHARP
  "double-flat": "\u{1D12B}", // MUSICAL SYMBOL DOUBLE FLAT
}

/**
 * Each accidental's ink sits lower than the em box these glyphs are
 * measured against, so centering the box (e.g. via flex) still leaves
 * the visible mark sitting low with its descender clipped. These
 * per-glyph nudges (in em, so they scale with font-size) shift the
 * ink up to sit dead-center in its button.
 */
const ACCIDENTAL_NUDGE: Record<AccidentalId, string> = {
  flat: "-0.21em",
  natural: "-0.36em",
  sharp: "-0.36em",
  "double-sharp": "-0.36em",
  "double-flat": "-0.21em",
}

export function AccidentalIcon({
  id,
  className,
}: {
  id: AccidentalId
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`font-music inline-flex items-center justify-center leading-none ${className ?? "text-base"}`}
      style={{ transform: `translateY(${ACCIDENTAL_NUDGE[id]})` }}
    >
      {ACCIDENTAL_CHAR[id]}
    </span>
  )
}

export function TieIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 12" fill="none" className={className} aria-hidden>
      <path
        d="M1.5 10C4 3 16 3 18.5 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
