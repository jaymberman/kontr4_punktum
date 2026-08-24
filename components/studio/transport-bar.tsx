"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Smallest loop the boundaries can be dragged to. Boundaries move
 * continuously rather than snapping to beats, so this is what stops the
 * two handles from being dragged onto each other.
 */
export const MIN_LOOP_BEATS = 0.25

/** Matches the `w-3` on the handles, used to center them on their beat. */
const HANDLE_WIDTH = 12

/**
 * Format a beat offset the way a musician reads a position: one-based
 * measure, then one-based beat within it.
 */
function formatBeat(beat: number, beatsPerMeasure: number) {
  const clamped = Math.max(0, beat)
  const measure = Math.floor(clamped / beatsPerMeasure) + 1
  const sub = Math.floor(clamped % beatsPerMeasure) + 1
  return `${measure}.${sub}`
}

export function TransportBar({
  totalBeats,
  beatsPerMeasure,
  playheadBeat,
  loopStart,
  loopEnd,
  isLooping,
  gutterWidth,
  noteWidth,
  scrollLeft,
  onSeek,
  onLoopChange,
}: {
  totalBeats: number
  beatsPerMeasure: number
  playheadBeat: number
  loopStart: number
  loopEnd: number
  isLooping: boolean
  gutterWidth: number
  noteWidth: number
  scrollLeft: number
  onSeek: (beat: number) => void
  onLoopChange: (start: number, end: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  /** Which loop boundary is being dragged, if any. */
  const [dragging, setDragging] = useState<"start" | "end" | null>(null)

  const measureCount = Math.max(1, Math.round(totalBeats / beatsPerMeasure))

  /**
   * X for a beat position, in the same coordinates the score uses.
   * Subtracting the score's scroll offset is what keeps this bar locked to
   * the notes underneath it.
   *
   * Beat N maps to the *left edge* of cell N, matching how the loop region
   * is drawn. Playback position, loop boundaries, and barlines therefore
   * all share one convention, so the playhead reaches the loop-end edge
   * exactly as playback wraps instead of overshooting it by half a cell.
   */
  const beatX = (beat: number) => gutterWidth + beat * noteWidth - scrollLeft

  /** Map a viewport x coordinate onto a continuous beat position. */
  const beatFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const beat = (clientX - rect.left + scrollLeft - gutterWidth) / noteWidth
      return Math.min(totalBeats, Math.max(0, beat))
    },
    [totalBeats, gutterWidth, noteWidth, scrollLeft],
  )

  /** Move one boundary, keeping a minimum span inside the loop. */
  const moveBoundary = useCallback(
    (which: "start" | "end", beat: number) => {
      if (which === "start") {
        onLoopChange(Math.min(beat, loopEnd - MIN_LOOP_BEATS), loopEnd)
      } else {
        onLoopChange(loopStart, Math.max(beat, loopStart + MIN_LOOP_BEATS))
      }
    },
    [loopStart, loopEnd, onLoopChange],
  )

  return (
    // No horizontal padding: the track's left edge has to coincide with
    // the score viewport's left edge for the shared x math to hold.
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border/60 bg-card/40 py-2">
      {/* Scrub bar. Click or drag anywhere to move playback, continuously
          rather than snapped, which is what makes the motion read as a
          scrub instead of a jump between beats. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={totalBeats}
        aria-valuenow={Number(playheadBeat.toFixed(2))}
        aria-valuetext={`Measure ${formatBeat(playheadBeat, beatsPerMeasure)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setIsScrubbing(true)
          onSeek(beatFromClientX(e.clientX))
        }}
        onPointerMove={(e) => {
          if (!isScrubbing) return
          onSeek(beatFromClientX(e.clientX))
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          setIsScrubbing(false)
        }}
        onPointerCancel={() => setIsScrubbing(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault()
            onSeek(Math.max(0, playheadBeat - 1))
          } else if (e.key === "ArrowRight") {
            e.preventDefault()
            onSeek(Math.min(totalBeats, playheadBeat + 1))
          } else if (e.key === "Home") {
            e.preventDefault()
            onSeek(loopStart)
          } else if (e.key === "End") {
            e.preventDefault()
            onSeek(loopEnd)
          }
        }}
        className={cn(
          "group relative h-6 cursor-pointer touch-none select-none rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60",
          isScrubbing && "cursor-grabbing",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          {/* Loop region, matching the shaded span over the score. */}
          <span
            className={cn(
              "absolute inset-y-0 transition-colors",
              isLooping ? "bg-primary/40" : "bg-primary/15",
            )}
            style={{
              left: beatX(loopStart),
              width: Math.max(0, (loopEnd - loopStart) * noteWidth),
            }}
          />
          {/* Elapsed, ending under the playhead line. Anchored to the loop
              start rather than beat 0, since that's where playback actually
              begins; clamped to the loop so scrubbing outside it can't draw
              the fill backwards or past the end. */}
          <span
            className="absolute inset-y-0 bg-accent/70"
            style={{
              left: beatX(loopStart),
              width:
                Math.max(
                  0,
                  Math.min(playheadBeat, loopEnd) - loopStart,
                ) * noteWidth,
            }}
          />
        </div>

        {/* Barlines, placed at the same x as the barlines drawn on the
            staves rather than spread evenly across the panel. Drawn above
            the loop/elapsed fill (not below it) and at higher contrast than
            the theme's default border color, which at 12% alpha read as
            barely-there once a semi-transparent fill sat behind them —
            the loop region sweeping past made them seem to flicker in and
            out rather than stay reliably visible. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden">
          {Array.from({ length: measureCount + 1 }, (_, i) => i).map((i) => (
            <span
              key={i}
              className="absolute top-0 h-full w-px bg-foreground/30"
              style={{ left: beatX(i * beatsPerMeasure) }}
            />
          ))}
        </div>

        {/* Playhead marker. Same x as the playhead line on the staves. */}
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-accent shadow-[0_0_8px_var(--accent)] transition-transform",
            isScrubbing ? "scale-125" : "group-hover:scale-110",
          )}
          style={{ left: beatX(playheadBeat) }}
        />

        {/* Loop boundary handles, overlaid directly on the bar so the loop
            span is set in the same place playback is scrubbed. They stop
            propagation so grabbing one never also seeks. */}
        {(["start", "end"] as const).map((which) => {
          const beat = which === "start" ? loopStart : loopEnd
          return (
            <span
              key={which}
              role="slider"
              tabIndex={0}
              aria-label={which === "start" ? "Loop start" : "Loop end"}
              aria-valuemin={0}
              aria-valuemax={totalBeats}
              aria-valuenow={Number(beat.toFixed(2))}
              aria-valuetext={`Measure ${formatBeat(
                which === "start" ? beat : Math.max(0, beat - MIN_LOOP_BEATS),
                beatsPerMeasure,
              )}`}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                setDragging(which)
              }}
              onPointerMove={(e) => {
                if (dragging !== which) return
                e.stopPropagation()
                // Continuous: the raw position is used as-is, so a
                // boundary can sit anywhere rather than jumping between
                // beat lines.
                moveBoundary(which, beatFromClientX(e.clientX))
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId)
                setDragging(null)
              }}
              onPointerCancel={() => setDragging(null)}
              onKeyDown={(e) => {
                // Keyboard still steps by whole beats, which is the only
                // way to land on an exact musical position by hand.
                if (e.key === "ArrowLeft") {
                  e.preventDefault()
                  moveBoundary(which, Math.ceil(beat - 1))
                } else if (e.key === "ArrowRight") {
                  e.preventDefault()
                  moveBoundary(which, Math.floor(beat + 1))
                }
              }}
              className={cn(
                "absolute top-1/2 flex h-4 w-3 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-sm border border-primary/80 bg-primary/40 transition-colors after:absolute after:-inset-x-1.5 after:-inset-y-1 hover:bg-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60",
                dragging === which && "bg-primary/80",
              )}
              // Centered on its boundary via `left` arithmetic rather than
              // a transform: Tailwind v4 emits `-translate-y-1/2` as the
              // separate `translate` property, so an inline `transform`
              // would stack with it and lift the handle off the bar.
              style={{ left: beatX(beat) - HANDLE_WIDTH / 2 }}
            >
              <span className="pointer-events-none h-2 w-px bg-primary" />
            </span>
          )
        })}
      </div>
    </div>
  )
}
