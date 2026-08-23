"use client"

import { memo, useEffect, useRef, useState } from "react"
import { Redo2, Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  StaffRow,
  NOTE_WIDTH,
  CLEF_WIDTH,
  LINE_GAP,
} from "@/components/studio/staff-row"
import { keySignatureWidth } from "@/components/studio/key-signature"
import { NotationToolbar } from "@/components/studio/notation-toolbar"
import { TransportBar } from "@/components/studio/transport-bar"
import type { OctaveShift, Voice } from "@/components/studio/types"
import { cn } from "@/lib/utils"

/**
 * The measure ruler is memoized because the playhead re-renders the canvas
 * every animation frame, and a long score's worth of measure headers is by
 * far the most expensive thing in this subtree.
 */
const MeasureRuler = memo(function MeasureRuler({
  measureCount,
  beatsPerMeasure,
  selectedMeasure,
  canDeleteMeasure,
  contentWidth,
  gutterWidth,
  onSelectMeasure,
  onDeleteMeasure,
}: {
  measureCount: number
  beatsPerMeasure: number
  selectedMeasure: number | null
  canDeleteMeasure: boolean
  contentWidth: number
  gutterWidth: number
  onSelectMeasure: (measure: number | null) => void
  onDeleteMeasure: (measure: number) => void
}) {
  const measureWidth = NOTE_WIDTH * beatsPerMeasure

  return (
    <div
      className="sticky top-0 z-20 flex border-b border-border/60 bg-card/80"
      style={{ width: contentWidth }}
    >
      <div className="relative flex flex-1">
        <div className="shrink-0" style={{ width: gutterWidth }} />
        {Array.from({ length: measureCount }, (_, i) => i).map((m) => {
          const isSelected = selectedMeasure === m
          return (
            <div
              key={m}
              className={cn(
                "group/measure relative flex shrink-0 items-center justify-between gap-1 border-r border-border/40 px-2 py-1 transition-colors",
                isSelected ? "bg-primary/15" : "hover:bg-muted/50",
              )}
              style={{ width: measureWidth }}
            >
              {/* Selecting a measure highlights that span across every
                  voice, and scopes the 8va/8vb toolbar controls. */}
              <button
                type="button"
                onClick={() => onSelectMeasure(isSelected ? null : m)}
                aria-pressed={isSelected}
                aria-label={`Measure ${m + 1}${isSelected ? ", selected" : ""}`}
                className="flex-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
              >
                <span
                  className={cn(
                    "font-mono text-[11px] transition-colors",
                    isSelected
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {m + 1}
                </span>
              </button>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canDeleteMeasure}
                      onClick={() => onDeleteMeasure(m)}
                      aria-label={`Delete measure ${m + 1}`}
                      className={cn(
                        "size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/measure:opacity-100",
                        isSelected && "opacity-100",
                      )}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  }
                />
                <TooltipContent>
                  {canDeleteMeasure
                    ? `Delete measure ${m + 1}`
                    : "A score needs at least one measure"}
                </TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export function StaffCanvas({
  voices,
  activeVoiceId,
  isPlaying,
  playheadBeat,
  loopStart,
  loopEnd,
  isLooping,
  measureCount,
  beatsPerMeasure,
  canDeleteMeasure,
  selectedMeasure,
  songName,
  musicalKey,
  onSongNameChange,
  onUpdateVoice,
  onSelectVoice,
  onSelectMeasure,
  onAddMeasures,
  onDeleteMeasure,
  onSetOctaveShift,
  onSeek,
  onLoopChange,
}: {
  voices: Voice[]
  activeVoiceId: string | null
  isPlaying: boolean
  playheadBeat: number
  loopStart: number
  loopEnd: number
  isLooping: boolean
  measureCount: number
  beatsPerMeasure: number
  canDeleteMeasure: boolean
  selectedMeasure: number | null
  songName: string
  musicalKey: string
  onSongNameChange: (name: string) => void
  onUpdateVoice: (id: string, patch: Partial<Voice>) => void
  onSelectVoice: (id: string) => void
  onSelectMeasure: (measure: number | null) => void
  onAddMeasures: (count: number) => void
  onDeleteMeasure: (measure: number) => void
  onSetOctaveShift: (shift: OctaveShift) => void
  onSeek: (beat: number) => void
  onLoopChange: (start: number, end: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalNotes = measureCount * beatsPerMeasure
  const [isEditingName, setIsEditingName] = useState(false)
  /**
   * Where the user has scrolled to by hand. During playback the score
   * follows the playhead instead, so this is only the resting position.
   */
  const [userScrollLeft, setUserScrollLeft] = useState(0)
  /** Viewport width, needed to center the playhead. Changes only on resize. */
  const [viewportWidth, setViewportWidth] = useState(0)

  const activeVoice = voices.find((v) => v.id === activeVoiceId) ?? null
  const activeOctaveShift =
    activeVoice && selectedMeasure !== null
      ? (activeVoice.octaveMarks[selectedMeasure] ?? null)
      : null

  const measureWidth = NOTE_WIDTH * beatsPerMeasure
  /**
   * Distance from the left edge of the score to the first note column:
   * the clef, plus however much the key signature needs. Every voice
   * shares one key, so this is uniform across rows and the ruler, loop
   * shading, and playhead can all measure from it.
   */
  const gutterWidth = CLEF_WIDTH + keySignatureWidth(musicalKey, LINE_GAP)
  const contentWidth = gutterWidth + totalNotes * NOTE_WIDTH
  /**
   * Beat N maps to the left edge of cell N, the same convention the loop
   * region and the scrub bar use. This previously added half a cell, which
   * left the playhead half a beat past the loop-end edge at the instant
   * playback wrapped, reading as an overshoot then a snap back.
   */
  const playheadX = gutterWidth + playheadBeat * NOTE_WIDTH

  /** Track the viewport width so the centering math has something to work from. */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () =>
      setViewportWidth((prev) =>
        prev === el.clientWidth ? prev : el.clientWidth,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /**
   * Scroll offset, derived rather than stored. During playback it follows
   * the playhead; otherwise it's wherever the user left the score.
   *
   * This is deliberately not state. Setting scroll state from a per-frame
   * effect meant every frame scheduled another render, which React counts
   * as nested updates and eventually aborts with "Maximum update depth
   * exceeded". Deriving it keeps playback to a single render per frame.
   */
  const maxScroll = Math.max(0, contentWidth - viewportWidth)
  const scrollLeft = isPlaying
    ? Math.max(0, Math.min(playheadX - viewportWidth / 2, maxScroll))
    : userScrollLeft

  /**
   * Push the derived offset to the DOM. Because playheadBeat advances
   * continuously this reads as one smooth pan rather than the discrete
   * jump a per-beat scrollTo produced.
   */
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isPlaying) return
    if (Math.abs(el.scrollLeft - scrollLeft) > 0.5) {
      el.scrollLeft = scrollLeft
    }
  }, [scrollLeft, isPlaying])

  /**
   * When playback stops, adopt wherever the follow left the score as the
   * new resting position. Without this the derived value would fall back
   * to a stale userScrollLeft and the score would jump on pause.
   */
  useEffect(() => {
    if (isPlaying) return
    const el = scrollRef.current
    if (!el) return
    setUserScrollLeft(el.scrollLeft)
  }, [isPlaying])

  return (
    <div className="glass-panel flex h-full flex-col overflow-hidden rounded-xl border border-border/70 shadow-2xl">
      {/* One unwrapped row. Overflowing controls are reached by scrolling
          horizontally, which keeps the bar a predictable single level. */}
      <div className="flex shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden border-b border-border/60 bg-card/60 px-4 py-2.5">
        <div className="shrink-0">
          {isEditingName ? (
            <Input
              autoFocus
              value={songName}
              onChange={(e) => onSongNameChange(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  setIsEditingName(false)
                }
              }}
              className="h-7 w-40 text-xs font-semibold uppercase tracking-wider"
              aria-label="Song name"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {songName}
            </button>
          )}
        </div>

        <Separator orientation="vertical" className="h-7 shrink-0" />

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Undo">
                  <Undo2 />
                </Button>
              }
            />
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Redo">
                  <Redo2 />
                </Button>
              }
            />
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-7 shrink-0" />

        <NotationToolbar
          measureCount={measureCount}
          selectedMeasure={selectedMeasure}
          activeOctaveShift={activeOctaveShift}
          onAddMeasures={onAddMeasures}
          onSetOctaveShift={onSetOctaveShift}
        />
      </div>

      {/* Given the same gutter, note width, and scroll offset as the score
          below, so the scrub marker and the playhead line share one x. */}
      <TransportBar
        totalBeats={totalNotes}
        beatsPerMeasure={beatsPerMeasure}
        playheadBeat={playheadBeat}
        loopStart={loopStart}
        loopEnd={loopEnd}
        isLooping={isLooping}
        gutterWidth={gutterWidth}
        noteWidth={NOTE_WIDTH}
        scrollLeft={scrollLeft}
        onSeek={onSeek}
        onLoopChange={onLoopChange}
      />

      <div
        ref={scrollRef}
        onScroll={(e) => {
          // Ignored while playing: the offset is derived from the playhead
          // then, so feeding these events back would fight that and
          // re-introduce the per-frame render cascade.
          if (isPlaying) return
          const next = e.currentTarget.scrollLeft
          setUserScrollLeft((prev) => (prev === next ? prev : next))
        }}
        className="relative flex-1 overflow-auto"
      >
        <MeasureRuler
          measureCount={measureCount}
          beatsPerMeasure={beatsPerMeasure}
          selectedMeasure={selectedMeasure}
          canDeleteMeasure={canDeleteMeasure}
          contentWidth={contentWidth}
          gutterWidth={gutterWidth}
          onSelectMeasure={onSelectMeasure}
          onDeleteMeasure={onDeleteMeasure}
        />

        <div className="relative" style={{ width: contentWidth }}>
          {/* Loop region shading, so the active playback span is visible
              against the score itself and not only on the scrub bar. */}
          <div
            className="pointer-events-none absolute inset-y-0 z-0 border-x border-primary/30 bg-primary/[0.04]"
            style={{
              left: gutterWidth + loopStart * NOTE_WIDTH,
              width: Math.max(0, (loopEnd - loopStart) * NOTE_WIDTH),
            }}
          />

          {/* Selected-measure highlight, spanning every voice so the
              selection reads as a vertical slice of the score. */}
          {selectedMeasure !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 z-0 border-x border-primary/40 bg-primary/[0.07]"
              style={{
                left: gutterWidth + selectedMeasure * measureWidth,
                width: measureWidth,
              }}
            />
          )}

          {voices.map((voice) => (
            <StaffRow
              key={voice.id}
              voice={voice}
              isActive={voice.id === activeVoiceId}
              totalNotes={totalNotes}
              beatsPerMeasure={beatsPerMeasure}
              musicalKey={musicalKey}
              onUpdate={onUpdateVoice}
              onSelect={onSelectVoice}
            />
          ))}

          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 z-10 w-px bg-accent",
              isPlaying ? "shadow-[0_0_12px_var(--accent)]" : "opacity-60",
            )}
            // Shifted half a pixel so the 1px stroke straddles playheadX
            // instead of sitting to its right, which is what lines the
            // line up exactly with the scrub bar's marker above it.
            style={{ left: playheadX, transform: "translateX(-0.5px)" }}
          />
        </div>
      </div>
    </div>
  )
}
