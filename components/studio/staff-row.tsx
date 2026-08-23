"use client"

import { memo, useCallback, useRef, useState } from "react"
import { ClefGlyph } from "@/components/studio/clef-icons"
import {
  KeySignature,
  keySignatureWidth,
} from "@/components/studio/key-signature"
import type { Voice } from "@/components/studio/types"
import {
  MAX_STAFF_POS,
  STAFF_LINE_POSITIONS,
  ledgerLinePositions,
  pitchName,
  pitchToStaffPos,
  staffPosDescription,
  staffPosToPitch,
  staffPosToY,
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

type Hover = { col: number; staffPos: number }

export const StaffRow = memo(function StaffRow({
  voice,
  isActive,
  totalNotes,
  beatsPerMeasure,
  musicalKey,
  onUpdate,
  onSelect,
}: {
  voice: Voice
  isActive: boolean
  totalNotes: number
  beatsPerMeasure: number
  musicalKey: string
  onUpdate: (id: string, patch: Partial<Voice>) => void
  onSelect: (id: string) => void
}) {
  /**
   * Everything left of the first note: clef plus key signature. The
   * signature widens the gutter, so the note columns, barlines, and
   * octave brackets all measure from here rather than from CLEF_WIDTH.
   */
  const gutter = CLEF_WIDTH + keySignatureWidth(musicalKey, LINE_GAP)
  const [hover, setHover] = useState<Hover | null>(null)
  /**
   * Mirror of `hover`, so the click handler can commit the exact position
   * the preview note head was drawn at rather than re-deriving it from the
   * click coordinates. State alone would be a render behind.
   */
  const hoverRef = useRef<Hover | null>(null)

  const columns = Array.from({ length: totalNotes }, (_, i) => i)

  /** Snap a pointer event to the line/space under the cursor. */
  const hoverFromEvent = useCallback(
    (col: number, e: React.PointerEvent<HTMLElement>): Hover => {
      const rect = e.currentTarget.getBoundingClientRect()
      const staffPos = yToStaffPos(
        e.clientY - rect.top - rect.height / 2,
        LINE_GAP,
      )
      return { col, staffPos }
    },
    [],
  )

  const trackHover = useCallback(
    (col: number, e: React.PointerEvent<HTMLElement>) => {
      const next = hoverFromEvent(col, e)
      hoverRef.current = next
      setHover((prev) =>
        prev && prev.col === next.col && prev.staffPos === next.staffPos
          ? prev
          : next,
      )
    },
    [hoverFromEvent],
  )

  const setNote = useCallback(
    (col: number, staffPos: number) => {
      const pitch = staffPosToPitch(staffPos, voice.clef)
      // Sparse write: leaves earlier beats genuinely empty instead of
      // back-filling them with copies of this pitch.
      const notes = voice.notes.slice()
      notes[col] = pitch
      onUpdate(voice.id, { notes })
      onSelect(voice.id)
    },
    [voice.clef, voice.notes, voice.id, onUpdate, onSelect],
  )

  /** Nudge an existing note by whole staff steps, for keyboard editing. */
  const nudgeNote = (col: number, delta: number) => {
    const current = voice.notes[col]
    if (current === undefined) return
    const next = Math.max(
      -MAX_STAFF_POS,
      Math.min(MAX_STAFF_POS, pitchToStaffPos(current, voice.clef) + delta),
    )
    setNote(col, next)
  }

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
      <div className="relative flex-1 overflow-hidden">
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

        <div
          className="absolute inset-y-0"
          style={{ left: gutter, width: totalNotes * NOTE_WIDTH }}
          onPointerLeave={clearHover}
        >
          {columns.map((col) => {
            const pitch = voice.notes[col]
            const hasNote = pitch !== undefined
            const rawStaffPos = hasNote
              ? pitchToStaffPos(pitch, voice.clef)
              : 0
            // Switching clef re-reads absolute pitches against a new
            // reference, which can push existing notes past the drawable
            // range. Clamp so they stay visible inside the row instead of
            // being clipped away by the staff's overflow.
            const staffPos = Math.max(
              -MAX_STAFF_POS,
              Math.min(MAX_STAFF_POS, rawStaffPos),
            )
            const y = staffPosToY(staffPos, LINE_GAP)
            const isBarStart = col % beatsPerMeasure === 0
            const measure = Math.floor(col / beatsPerMeasure) + 1
            const beat = (col % beatsPerMeasure) + 1
            const isHovered = hover?.col === col

            return (
              <div
                key={col}
                className="absolute inset-y-0"
                style={{ left: col * NOTE_WIDTH, width: NOTE_WIDTH }}
              >
                {isBarStart && col !== 0 && (
                  <div className="absolute inset-y-2 left-0 w-px bg-foreground/25" />
                )}

                {/* One click target per beat. The commit reads the tracked
                    hover position, so the note always lands exactly where
                    the preview note head was showing. */}
                <button
                  type="button"
                  className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                  aria-label={
                    hasNote
                      ? `Measure ${measure}, beat ${beat}: ${pitchName(pitch)} ${staffPosDescription(staffPos)}. Use arrow keys to change pitch.`
                      : `Measure ${measure}, beat ${beat}: empty. Click to add a note.`
                  }
                  onPointerMove={(e) => trackHover(col, e)}
                  onPointerDown={(e) => trackHover(col, e)}
                  onClick={() => {
                    const target = hoverRef.current
                    if (!target || target.col !== col) return
                    setNote(col, target.staffPos)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault()
                      nudgeNote(col, 1)
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault()
                      nudgeNote(col, -1)
                    }
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
                    {ledgerLinePositions(hover.staffPos).map((p) => (
                      <div
                        key={p}
                        className="absolute left-1/2 h-px bg-foreground/25"
                        style={{
                          width: LEDGER_WIDTH,
                          top: `calc(50% + ${
                            staffPosToY(p, LINE_GAP) -
                            staffPosToY(hover.staffPos, LINE_GAP)
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

                {hasNote && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center"
                    style={{
                      transform: `translate(-50%, calc(-50% + ${y}px))`,
                    }}
                  >
                    {/* Ledger lines: one per line position between the
                        staff edge and the note, as engraving requires. */}
                    {ledgerLinePositions(staffPos).map((p) => (
                      <div
                        key={p}
                        className="absolute left-1/2 h-px bg-foreground/30"
                        style={{
                          width: LEDGER_WIDTH,
                          top: `calc(50% + ${staffPosToY(p, LINE_GAP) - y}px)`,
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    ))}
                    {/* Note heads keep their voice color throughout
                        playback; the moving playhead line is the only
                        position indicator, so nothing flashes per beat. */}
                    <div
                      className="size-3 rounded-full border-2 bg-transparent"
                      style={{
                        borderColor: voice.color,
                        opacity: voice.muted ? 0.3 : 0.9,
                      }}
                    />
                    <div
                      className="absolute h-8 w-px"
                      style={{
                        background: voice.color,
                        opacity: voice.muted ? 0.25 : 0.7,
                        top: staffPos < 0 ? "calc(50% - 32px)" : "50%",
                        left: "calc(50% + 5px)",
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export { NOTE_WIDTH, STAFF_HEIGHT, CLEF_WIDTH, LINE_GAP }
