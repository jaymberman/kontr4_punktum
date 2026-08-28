"use client"

import { memo, useCallback, useMemo, useRef, useState } from "react"
import { ClefGlyph } from "@/components/studio/clef-icons"
import {
  KeySignature,
  keySignatureWidth,
} from "@/components/studio/key-signature"
import { AccidentalIcon, RestIcon, TieIcon } from "@/components/studio/notation-icons"
import {
  KEY_SIGNATURES,
  type NoteDurationId,
  type NoteEvent,
  type TimeSignature,
  type Voice,
} from "@/components/studio/types"
import {
  computeBeamGroups,
  eventTicks,
  getMeasureOrImplicit,
  priorEventsBeforeTick,
  resolveInEffectAccidental,
  TICKS_PER_QUARTER,
  type CursorPos,
} from "@/components/studio/rhythm"
import {
  LETTER_NAMES,
  MAX_STAFF_POS,
  STAFF_LINE_POSITIONS,
  isLinePosition,
  ledgerLinePositions,
  letterIndexOfStep,
  octaveOfStep,
  staffPosToStep,
  staffPosToY,
  stepPx,
  stepToStaffPos,
  yToStaffPos,
} from "@/components/studio/staff-geometry"
import { cn } from "@/lib/utils"

const NOTE_WIDTH = 56
/**
 * Row height. MAX_STAFF_POS of 8 puts the furthest note center 48px from
 * the middle line, plus 6px of note head, so half of this (60px) clears it
 * with a little room left for the 8va/8vb bracket.
 */
const STAFF_HEIGHT = 120
const LINE_GAP = 12
const CLEF_WIDTH = 60

/** Half-width of a ledger line, matching the original engraving. */
const LEDGER_WIDTH = 20

/** Notehead diameter, matching the previous hand-drawn "size-3" circle. */
const NOTEHEAD_SIZE = 12
/** Default stem length for an un-beamed note, matching the previous "h-8". */
const STEM_LENGTH = 32
/** Horizontal offset of the stem from the notehead's center. */
const STEM_OFFSET = 5
/** Vertical spacing between stacked beam levels (8th/16th/32nd). */
const BEAM_SPACING = 5
const BEAM_THICKNESS = 3
const DOT_SIZE = 4
const DOT_GAP = 4
const TIE_Y_OFFSET = 9

const FLAG_COUNT: Record<NoteDurationId, number> = {
  whole: 0,
  half: 0,
  quarter: 0,
  "8th": 1,
  "16th": 2,
  "32nd": 3,
}

/**
 * Nominal vertical placement for rests, in staff positions. Only whole and
 * half rests get their traditional engraved placement (hanging from the 4th
 * line / sitting on the middle line); everything else is simply centered —
 * an acceptable simplification for a rhythm-accurate rewrite.
 */
const REST_NOMINAL_STAFF_POS: Partial<Record<NoteDurationId, number>> = {
  whole: 2,
  half: 0,
}

type NoteEventNote = Extract<NoteEvent, { kind: "note" }>

type Hover = { index: number; staffPos: number }

interface PositionedEvent {
  event: NoteEvent
  measureIndex: number
  tickOffset: number
  x: number
  width: number
  centerX: number
  showAccidental: boolean
  /** Set when this note is part of a beam group: shared stem direction and
   *  the y (relative to the staff's middle line) this note's stem reaches. */
  beam?: { stemUp: boolean; y: number }
  isBeamed: boolean
}

interface BeamSegment {
  x1: number
  x2: number
  y: number
}

interface Tie {
  x1: number
  x2: number
  y: number
}

function eventLabel(event: NoteEvent): string {
  const dotted = event.dotted ? "dotted " : ""
  if (event.kind === "rest") {
    return `${dotted}${event.duration} rest`
  }
  const letter = LETTER_NAMES[letterIndexOfStep(event.step)]
  const octave = octaveOfStep(event.step) - 1
  const accidental = event.accidental ? ` ${event.accidental}` : ""
  return `${letter}${octave}${accidental} ${dotted}${event.duration} note`
}

/** A single flag curve, hand-drawn to match the stem's color/opacity theming. */
function NoteFlag({
  stemUp,
  tipY,
  color,
  opacity,
}: {
  stemUp: boolean
  tipY: number
  color: string
  opacity: number
}) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      className="absolute overflow-visible"
      style={{ left: `calc(50% + ${STEM_OFFSET}px)`, top: `calc(50% + ${tipY}px)` }}
      aria-hidden
    >
      <path
        d={stemUp ? "M0 0 C 6 1, 6 5, 1 8" : "M0 9 C 6 8, 6 4, 1 1"}
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </svg>
  )
}

export const StaffRow = memo(function StaffRow({
  voice,
  isActive,
  measureCount,
  beatsPerMeasure,
  timeSignature,
  musicalKey,
  cursor,
  hasEditFocus,
  onSelect,
  onPlaceNoteAtClick,
}: {
  voice: Voice
  isActive: boolean
  measureCount: number
  beatsPerMeasure: number
  timeSignature: TimeSignature
  musicalKey: string
  cursor: CursorPos
  hasEditFocus: boolean
  onSelect: (id: string) => void
  onPlaceNoteAtClick: (
    voiceId: string,
    measureIndex: number,
    tick: number,
    step: number,
  ) => void
}) {
  /**
   * Everything left of the first note: clef plus key signature. The
   * signature widens the gutter, so the note columns, barlines, and
   * octave brackets all measure from here rather than from CLEF_WIDTH.
   */
  const gutter = CLEF_WIDTH + keySignatureWidth(musicalKey, LINE_GAP)
  const keySignature = KEY_SIGNATURES[musicalKey] ?? KEY_SIGNATURES["C major"]

  const [hover, setHover] = useState<Hover | null>(null)
  /**
   * Mirror of `hover`, so the click handler can commit the exact position
   * the preview note head was drawn at rather than re-deriving it from the
   * click coordinates. State alone would be a render behind.
   */
  const hoverRef = useRef<Hover | null>(null)

  /**
   * Lays out every event across all measures into absolute x/width slots,
   * resolves beam grouping (shared stem direction, per-note stem reach,
   * and the beam bar segments themselves), and figures out which ties are
   * actually valid (matching pitch on both ends) — all in one pass so tie
   * targets can look at "the next positioned event" even across a measure
   * boundary.
   */
  const { positioned, beamSegments, ties } = useMemo(() => {
    const positioned: PositionedEvent[] = []
    const beamSegments: BeamSegment[] = []

    for (let m = 0; m < measureCount; m++) {
      const measure = getMeasureOrImplicit(voice, timeSignature, m)
      const groups = computeBeamGroups(measure.events, timeSignature)
      const measureStartIndex = positioned.length

      const groupOfLocalIndex = new Map<number, { groupIdx: number; posInGroup: number }>()
      groups.forEach((g, gi) => {
        g.eventIndices.forEach((localIdx, pos) => {
          groupOfLocalIndex.set(localIdx, { groupIdx: gi, posInGroup: pos })
        })
      })

      const groupMeta = groups.map((g) => {
        const notes = g.eventIndices.map((i) => measure.events[i] as NoteEventNote)
        const stemUp = stepToStaffPos(notes[0].step, voice.clef) < 0
        const noteYs = notes.map((n) => staffPosToY(stepToStaffPos(n.step, voice.clef), LINE_GAP))
        const beamY = stemUp
          ? Math.min(...noteYs) - STEM_LENGTH
          : Math.max(...noteYs) + STEM_LENGTH

        const flagCounts = notes.map((n) => FLAG_COUNT[n.duration])
        const reachesLevel = flagCounts.map(() => 1)
        const segments: { level: number; startPos: number; endPos: number }[] = []
        const maxLevel = Math.max(...flagCounts)
        for (let level = 1; level <= maxLevel; level++) {
          let runStart = -1
          for (let pos = 0; pos <= flagCounts.length; pos++) {
            const qualifies = pos < flagCounts.length && flagCounts[pos] >= level
            if (qualifies) {
              if (runStart === -1) runStart = pos
            } else if (runStart !== -1) {
              const runEnd = pos - 1
              if (runEnd > runStart) {
                segments.push({ level, startPos: runStart, endPos: runEnd })
                for (let p = runStart; p <= runEnd; p++) reachesLevel[p] = level
              }
              runStart = -1
            }
          }
        }
        return { stemUp, beamY, reachesLevel, segments }
      })

      let tickCursor = 0
      measure.events.forEach((event, localIdx) => {
        const ticks = eventTicks(event)
        const x =
          gutter +
          m * beatsPerMeasure * NOTE_WIDTH +
          (tickCursor / TICKS_PER_QUARTER) * NOTE_WIDTH
        const width = (ticks / TICKS_PER_QUARTER) * NOTE_WIDTH

        let showAccidental = false
        if (event.kind === "note") {
          const prior = priorEventsBeforeTick(measure, tickCursor)
          const inEffect = resolveInEffectAccidental(
            prior,
            letterIndexOfStep(event.step),
            octaveOfStep(event.step),
            keySignature,
          )
          showAccidental = inEffect !== event.accidental
        }

        const gInfo = groupOfLocalIndex.get(localIdx)
        let beam: PositionedEvent["beam"]
        if (gInfo && event.kind === "note") {
          const meta = groupMeta[gInfo.groupIdx]
          const dir = meta.stemUp ? -1 : 1
          const reach = meta.reachesLevel[gInfo.posInGroup]
          beam = { stemUp: meta.stemUp, y: meta.beamY + dir * (reach - 1) * BEAM_SPACING }
        }

        positioned.push({
          event,
          measureIndex: m,
          tickOffset: tickCursor,
          x,
          width,
          centerX: x + width / 2,
          showAccidental,
          beam,
          isBeamed: Boolean(gInfo),
        })
        tickCursor += ticks
      })

      groups.forEach((g, gi) => {
        const meta = groupMeta[gi]
        const dir = meta.stemUp ? -1 : 1
        meta.segments.forEach((seg) => {
          const startEvent = positioned[measureStartIndex + g.eventIndices[seg.startPos]]
          const endEvent = positioned[measureStartIndex + g.eventIndices[seg.endPos]]
          beamSegments.push({
            x1: startEvent.centerX,
            x2: endEvent.centerX,
            y: meta.beamY + dir * (seg.level - 1) * BEAM_SPACING,
          })
        })
      })
    }

    const ties: Tie[] = []
    positioned.forEach((p, i) => {
      if (p.event.kind !== "note" || !p.event.tiedToNext) return
      const next = positioned[i + 1]
      if (!next || next.event.kind !== "note") return
      if (next.event.step !== p.event.step || next.event.accidental !== p.event.accidental) return
      const y = staffPosToY(stepToStaffPos(p.event.step, voice.clef), LINE_GAP)
      ties.push({
        x1: p.centerX + NOTEHEAD_SIZE / 2,
        x2: next.centerX - NOTEHEAD_SIZE / 2,
        y,
      })
    })

    return { positioned, beamSegments, ties }
  }, [voice, measureCount, beatsPerMeasure, timeSignature, musicalKey, keySignature, gutter])

  /** Snap a pointer event to the line/space under the cursor. */
  const hoverFromEvent = useCallback(
    (index: number, e: React.PointerEvent<HTMLElement>): Hover => {
      const rect = e.currentTarget.getBoundingClientRect()
      const staffPos = yToStaffPos(
        e.clientY - rect.top - rect.height / 2,
        LINE_GAP,
      )
      return { index, staffPos }
    },
    [],
  )

  const trackHover = useCallback(
    (index: number, e: React.PointerEvent<HTMLElement>) => {
      const next = hoverFromEvent(index, e)
      hoverRef.current = next
      setHover((prev) =>
        prev && prev.index === next.index && prev.staffPos === next.staffPos
          ? prev
          : next,
      )
    },
    [hoverFromEvent],
  )

  const clearHover = useCallback(() => {
    hoverRef.current = null
    setHover(null)
  }, [])

  return (
    <div
      className={cn(
        "relative flex items-stretch border-b border-border/60 transition-colors last:border-b-0",
        isActive ? "bg-primary/[0.04]" : "",
      )}
      style={{ height: STAFF_HEIGHT }}
    >
      <div className="relative flex-1 overflow-hidden" onPointerLeave={clearHover}>
        {/* The five staff lines, drawn from the shared geometry so the
            printed lines and the click targets can never drift apart. */}
        <div
          className="absolute inset-x-0"
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          {STAFF_LINE_POSITIONS.map((staffPos) => (
            <div
              key={staffPos}
              className="absolute inset-x-0 h-px bg-foreground/20"
              style={{ top: staffPosToY(staffPos, LINE_GAP) }}
            />
          ))}
        </div>

        <div
          className="absolute inset-y-0 left-0"
          style={{ width: CLEF_WIDTH, color: voice.color }}
        >
          <ClefGlyph clef={voice.clef} lineGap={LINE_GAP} />
        </div>

        {/* Key signature, immediately right of the clef exactly as it is
            engraved in a real score. Its accidental positions depend on
            the clef, so each voice draws its own. */}
        <div
          className="absolute inset-y-0 text-foreground/75"
          style={{ left: CLEF_WIDTH }}
        >
          <KeySignature
            musicalKey={musicalKey}
            clef={voice.clef}
            lineGap={LINE_GAP}
          />
        </div>

        {/* 8va/8vb brackets. These are performance instructions, so the
            written note positions below are deliberately unchanged. */}
        {Object.entries(voice.octaveMarks).map(([key, shift]) => {
          const measure = Number(key)
          const left = gutter + measure * beatsPerMeasure * NOTE_WIDTH
          const width = beatsPerMeasure * NOTE_WIDTH
          const isAbove = shift === "8va"
          return (
            <div
              key={key}
              className="pointer-events-none absolute flex items-center gap-1"
              style={{
                left,
                width,
                [isAbove ? "top" : "bottom"]: 2,
                color: voice.color,
              }}
            >
              <span className="shrink-0 font-serif text-[10px] font-semibold italic leading-none">
                {shift}
              </span>
              <span className="h-px flex-1 border-t border-dashed border-current opacity-70" />
              {/* Hook turning toward the staff marks where it ends. */}
              <span
                className={cn(
                  "w-px shrink-0 border-l border-dashed border-current opacity-70",
                  isAbove ? "h-1.5 self-end" : "h-1.5 self-start",
                )}
              />
            </div>
          )
        })}

        {/* Beam bars, drawn beneath the notes/stems that reach them. */}
        {beamSegments.map((seg, i) => (
          <div
            key={i}
            className="pointer-events-none absolute"
            style={{
              left: Math.min(seg.x1, seg.x2),
              width: Math.abs(seg.x2 - seg.x1),
              height: BEAM_THICKNESS,
              background: voice.color,
              opacity: voice.muted ? 0.25 : 0.75,
              top: "50%",
              transform: `translateY(calc(-50% + ${seg.y}px))`,
            }}
          />
        ))}

        {/* Ties, spanning from one notehead's right edge to the next
            notehead's left edge — only for pairs that actually match. */}
        {ties.map((tie, i) => (
          <div
            key={i}
            className="pointer-events-none absolute"
            style={{
              left: tie.x1,
              width: Math.max(2, tie.x2 - tie.x1),
              top: "50%",
              transform: `translateY(calc(-50% + ${tie.y + TIE_Y_OFFSET}px))`,
              color: voice.color,
              opacity: voice.muted ? 0.4 : 0.8,
            }}
          >
            <TieIcon className="h-3 w-full" />
          </div>
        ))}

        {positioned.map((p, i) => {
          const isNote = p.event.kind === "note"
          const rawStaffPos = isNote
            ? stepToStaffPos((p.event as NoteEventNote).step, voice.clef)
            : (REST_NOMINAL_STAFF_POS[p.event.duration] ?? 0)
          const staffPos = isNote
            ? Math.max(-MAX_STAFF_POS, Math.min(MAX_STAFF_POS, rawStaffPos))
            : rawStaffPos
          const y = staffPosToY(staffPos, LINE_GAP)
          const isHovered = hover?.index === i
          /** The event at the note-entry cursor — distinct from the
           *  accent-colored playhead line drawn separately by
           *  staff-canvas.tsx — glows in place of a separate cursor mark. */
          const isEditing =
            isActive &&
            hasEditFocus &&
            p.measureIndex === cursor.measureIndex &&
            p.tickOffset === cursor.tick

          const hollow = p.event.duration === "whole" || p.event.duration === "half"
          const hasStem = isNote && p.event.duration !== "whole"
          const stemUp = p.beam ? p.beam.stemUp : staffPos < 0
          const stemReachY = p.beam ? p.beam.y : stemUp ? y - STEM_LENGTH : y + STEM_LENGTH
          const stemDelta = stemReachY - y
          const stemTop = Math.min(0, stemDelta)
          const stemHeight = Math.abs(stemDelta)
          const showFlags = isNote && !p.isBeamed && FLAG_COUNT[p.event.duration] > 0

          const noteOpacity = voice.muted ? 0.3 : 0.9
          const stemOpacity = voice.muted ? 0.25 : 0.7

          return (
            <div
              key={p.event.id}
              className="absolute inset-y-0"
              style={{ left: p.x, width: p.width }}
            >
              {/* One click target per rendered event, sized to its actual
                  duration span. The commit reads the tracked hover
                  position, so the note always lands exactly where the
                  preview note head was showing. */}
              <button
                type="button"
                className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                aria-label={`Measure ${p.measureIndex + 1}: ${eventLabel(p.event)}`}
                onPointerMove={(e) => trackHover(i, e)}
                onPointerDown={(e) => trackHover(i, e)}
                onClick={() => {
                  const target = hoverRef.current
                  if (!target || target.index !== i) return
                  const step = staffPosToStep(target.staffPos, voice.clef)
                  onPlaceNoteAtClick(voice.id, p.measureIndex, p.tickOffset, step)
                  onSelect(voice.id)
                }}
              />

              {/* Snap preview: shows exactly which line or space the
                  click will commit to before it happens. */}
              {isHovered && hover && (
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2"
                  style={{
                    transform: `translate(-50%, calc(-50% + ${staffPosToY(hover.staffPos, LINE_GAP)}px))`,
                  }}
                >
                  {ledgerLinePositions(hover.staffPos).map((lp) => (
                    <div
                      key={lp}
                      className="absolute left-1/2 h-px bg-foreground/25"
                      style={{
                        width: LEDGER_WIDTH,
                        top: `calc(50% + ${
                          staffPosToY(lp, LINE_GAP) - staffPosToY(hover.staffPos, LINE_GAP)
                        }px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  ))}
                  <div
                    className="size-3 rounded-full border-2 opacity-40"
                    style={{ borderColor: voice.color }}
                  />
                </div>
              )}

              <div
                className="pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center"
                style={{ transform: `translate(-50%, calc(-50% + ${y}px))` }}
              >
                {/* Ledger lines: one per line position between the staff
                    edge and the note, as engraving requires. */}
                {isNote &&
                  ledgerLinePositions(staffPos).map((lp) => (
                    <div
                      key={lp}
                      className="absolute left-1/2 h-px bg-foreground/30"
                      style={{
                        width: LEDGER_WIDTH,
                        top: `calc(50% + ${staffPosToY(lp, LINE_GAP) - y}px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  ))}

                {isNote ? (
                  <div
                    className={cn("rounded-full border-2", isEditing && "animate-pulse")}
                    style={{
                      width: NOTEHEAD_SIZE,
                      height: NOTEHEAD_SIZE,
                      borderColor: voice.color,
                      backgroundColor: hollow ? "transparent" : voice.color,
                      opacity: noteOpacity,
                      boxShadow: isEditing
                        ? `0 0 0 5px color-mix(in srgb, ${voice.color} 35%, transparent), 0 0 10px 3px ${voice.color}`
                        : undefined,
                    }}
                  />
                ) : (
                  <div
                    className={cn(isEditing && "animate-pulse")}
                    style={{
                      color: voice.color,
                      opacity: noteOpacity,
                      filter: isEditing ? `drop-shadow(0 0 6px ${voice.color})` : undefined,
                    }}
                  >
                    <RestIcon duration={p.event.duration} className="text-2xl" />
                  </div>
                )}

                {hasStem && (
                  <div
                    className="absolute w-px"
                    style={{
                      background: voice.color,
                      opacity: stemOpacity,
                      left: `calc(50% + ${STEM_OFFSET}px)`,
                      top: `calc(50% + ${stemTop}px)`,
                      height: stemHeight,
                    }}
                  />
                )}

                {showFlags &&
                  Array.from({ length: FLAG_COUNT[p.event.duration] }).map((_, flagIdx) => (
                    <NoteFlag
                      key={flagIdx}
                      stemUp={stemUp}
                      tipY={stemDelta + (stemUp ? 1 : -1) * flagIdx * 6}
                      color={voice.color}
                      opacity={stemOpacity}
                    />
                  ))}

                {isNote && p.showAccidental && (
                  <div
                    className="absolute flex items-center text-foreground/85"
                    // `flex items-center` (not just top:50%/translateY(-50%))
                    // is load-bearing: without it, this div's auto height is
                    // padded by an inherited-line-height "strut" the inline
                    // AccidentalIcon span doesn't itself occupy, so its
                    // vertical center sits a couple px off the notehead's
                    // even though the math for the centering transform looks
                    // right. Flex sizes the box to its content directly.
                    style={{ right: "100%", top: "50%", transform: "translate(-4px, -50%)" }}
                  >
                    <AccidentalIcon
                      id={(p.event as NoteEventNote).accidental ?? "natural"}
                      className="text-[31.5px]"
                    />
                  </div>
                )}

                {p.event.dotted && (
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: DOT_SIZE,
                      height: DOT_SIZE,
                      left: "100%",
                      top: "50%",
                      background: voice.color,
                      opacity: noteOpacity,
                      transform: `translate(${DOT_GAP}px, calc(-50% + ${
                        isLinePosition(staffPos) ? -stepPx(LINE_GAP) : 0
                      }px))`,
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}

      </div>
    </div>
  )
})

export { NOTE_WIDTH, STAFF_HEIGHT, CLEF_WIDTH, LINE_GAP }
