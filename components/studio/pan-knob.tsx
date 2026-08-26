"use client"

import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const PAN_MIN = -50
const PAN_MAX = 50
const PAN_STEP = 1

/** Pixels of vertical drag that sweep the full -50..50 range. */
const DRAG_RANGE_PX = 140

const clampPan = (value: number) =>
  Math.round(Math.min(PAN_MAX, Math.max(PAN_MIN, value)))

function panValueText(value: number) {
  if (value === 0) return "Centered"
  return value < 0 ? `${-value} left` : `${value} right`
}

/**
 * A rotary pan control: drag vertically to sweep -50 (full left) to 50 (full
 * right) across a 180° arc, or click to type an exact value. Dragging also
 * pops the numeric readout open for live feedback, and leaves it open
 * afterward for fine-tuning by typing. Vertical-delta dragging rather than
 * literal angle-from-cursor tracking, because angle tracking is unusably
 * twitchy on a control this small — a little cursor drift near the center
 * swings the value wildly.
 */
export function PanKnob({
  value,
  onChange,
  color,
  label,
  disabled = false,
}: {
  value: number
  onChange: (value: number) => void
  color: string
  label: string
  disabled?: boolean
}) {
  const knobRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  const dragRef = useRef<{ startY: number; startValue: number } | null>(null)
  /**
   * Set by Escape so the close it triggers discards the draft instead of
   * committing it. Cleared whenever the popover (re)opens, and consumed the
   * next time it closes — whichever path that turns out to be (Escape's own
   * setOpen(false) call below, or a redundant close the underlying Popover
   * primitive fires on its own for the same keypress).
   */
  const cancelledRef = useRef(false)

  const openPopover = () => {
    cancelledRef.current = false
    setDraft(String(value))
    setOpen(true)
  }

  const commitDraft = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) onChange(clampPan(parsed))
    setOpen(false)
  }

  /**
   * The only path that closes the popover without going through
   * commitDraft/openPopover above is the primitive's own dismiss handling
   * (outside click, its internal Escape listener). Centralizing the
   * commit-vs-discard decision here — rather than in the Input's onBlur —
   * means it doesn't matter whether a given browser/primitive combination
   * happens to blur the input before an outside click closes the popover.
   */
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true)
      return
    }
    if (cancelledRef.current) {
      cancelledRef.current = false
      setOpen(false)
      return
    }
    commitDraft()
  }

  const angleDeg = (value / PAN_MAX) * 90

  return (
    <>
      <button
        ref={knobRef}
        type="button"
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={label}
        aria-valuemin={PAN_MIN}
        aria-valuemax={PAN_MAX}
        aria-valuenow={value}
        aria-valuetext={panValueText(value)}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current = { startY: e.clientY, startValue: value }
          // Open immediately so a drag shows live numeric feedback the
          // whole time, not just after release — and it's exactly what a
          // stationary click needs too, so one call covers both.
          openPopover()
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const drag = dragRef.current
          if (!drag) return
          const deltaY = drag.startY - e.clientY
          const next = clampPan(
            drag.startValue + (deltaY / DRAG_RANGE_PX) * (PAN_MAX - PAN_MIN),
          )
          if (next !== value) onChange(next)
          setDraft(String(next))
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          e.currentTarget.releasePointerCapture(e.pointerId)
          dragRef.current = null
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (disabled) return
          // Covers keyboard activation (Enter/Space on a focused button
          // synthesize a click with no preceding pointerdown). Harmless — a
          // mouse click already opened it via onPointerDown above; this
          // just resets the draft to the same current value again.
          openPopover()
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (disabled) return
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault()
            onChange(clampPan(value - PAN_STEP))
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault()
            onChange(clampPan(value + PAN_STEP))
          } else if (e.key === "Home") {
            e.preventDefault()
            onChange(0)
          }
          // Enter/Space fall through to native <button> behavior, which
          // synthesizes a click — handled by onClick above.
        }}
        className={cn(
          "relative size-6 shrink-0 touch-none rounded-full bg-secondary transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60",
          !disabled && "cursor-grab hover:bg-secondary/80 active:cursor-grabbing",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${angleDeg}deg)` }}
        >
          <span
            className="absolute top-[3px] left-1/2 size-[3px] -translate-x-1/2 rounded-full"
            style={{ background: color }}
          />
        </span>
      </button>

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverContent
          anchor={knobRef}
          side="top"
          className="w-20 gap-1.5 p-2"
          onClick={(e) => e.stopPropagation()}
          finalFocus={knobRef}
        >
          <Input
            type="number"
            min={PAN_MIN}
            max={PAN_MAX}
            step={PAN_STEP}
            value={draft}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Enter") {
                e.preventDefault()
                commitDraft()
              } else if (e.key === "Escape") {
                e.preventDefault()
                cancelledRef.current = true
                setOpen(false)
              }
            }}
            className="h-7 text-center"
            aria-label={label}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}
