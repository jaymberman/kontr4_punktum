"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { PanelRightClose, PanelRightOpen, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { VoiceTrack } from "@/components/studio/voice-track"
import { VOICE_COLORS, type Voice } from "@/components/studio/types"
import { cn } from "@/lib/utils"

/** A card's resting geometry, captured once when a drag begins. */
type Slot = { id: string; top: number; height: number }

type DragState = {
  id: string
  fromIndex: number
  /** Where inside the card the pointer grabbed it. */
  grabX: number
  grabY: number
  width: number
  /** Resting positions of every card at the moment the drag started. */
  slots: Slot[]
  /** Vertical distance between adjacent slots, i.e. card height + gap. */
  step: number
}

export function RightPanel({
  voices,
  activeVoiceId,
  onSelectVoice,
  onUpdateVoice,
  onAddVoice,
  onDeleteVoice,
  onReorderVoices,
}: {
  voices: Voice[]
  activeVoiceId: string | null
  isPlaying: boolean
  onSelectVoice: (id: string) => void
  onUpdateVoice: (id: string, patch: Partial<Voice>) => void
  onAddVoice: () => void
  onDeleteVoice: (id: string) => void
  onReorderVoices: (fromId: string, toId: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  /** Live pointer position, so the floating card tracks the cursor 1:1. */
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [overIndex, setOverIndex] = useState<number | null>(null)

  /** Refs mirror state so the window listeners never read stale values. */
  const dragRef = useRef<DragState | null>(null)
  const overRef = useRef<number | null>(null)

  const resetDrag = useCallback(() => {
    dragRef.current = null
    overRef.current = null
    setDrag(null)
    setOverIndex(null)
  }, [])

  /**
   * Snapshot every card's resting rect up front. Measuring live during the
   * drag would read the budge transforms back in and feed on itself.
   */
  const beginDrag = (id: string, index: number, e: React.PointerEvent) => {
    const cards = listRef.current?.querySelectorAll<HTMLElement>("[data-voice-id]")
    if (!cards || cards.length === 0) return

    const slots: Slot[] = Array.from(cards).map((card) => {
      const r = card.getBoundingClientRect()
      return { id: card.dataset.voiceId ?? "", top: r.top, height: r.height }
    })

    const self = slots[index]
    if (!self) return

    const step =
      slots.length > 1 ? slots[1].top - slots[0].top : self.height + 10

    // Fall back to the card's own origin when a pointer coordinate is
    // missing, so the floating ghost can never be positioned with NaN.
    const rect = cards[index].getBoundingClientRect()
    const pointerX = Number.isFinite(e.clientX) ? e.clientX : rect.left
    const pointerY = Number.isFinite(e.clientY) ? e.clientY : self.top

    const state: DragState = {
      id,
      fromIndex: index,
      grabX: pointerX - rect.left,
      grabY: pointerY - self.top,
      width: rect.width,
      slots,
      step,
    }

    dragRef.current = state
    overRef.current = index
    setDrag(state)
    setOverIndex(index)
    setPointer({ x: pointerX, y: pointerY })
  }

  /**
   * Pointer-based dragging rather than HTML5 drag-and-drop: it needs no
   * drag image, works with touch, and lets the drop position be derived
   * from the floating card's own center rather than from dragover events.
   */
  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      e.preventDefault()
      setPointer({ x: e.clientX, y: e.clientY })

      const state = dragRef.current
      if (!state) return

      // Compare the floating card's center against each resting center,
      // so the gap opens as soon as the card has visibly passed a
      // neighbour rather than when the raw cursor crosses an edge.
      const center = e.clientY - state.grabY + state.slots[state.fromIndex].height / 2
      let next = 0
      state.slots.forEach((slot, i) => {
        if (center >= slot.top + slot.height / 2) next = i
      })

      if (next !== overRef.current) {
        overRef.current = next
        setOverIndex(next)
      }
    }

    const onUp = () => {
      const state = dragRef.current
      const to = overRef.current
      if (state && to !== null && to !== state.fromIndex) {
        const target = state.slots[to]
        if (target) onReorderVoices(state.id, target.id)
      }
      resetDrag()
    }

    window.addEventListener("pointermove", onMove, { passive: false })
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", resetDrag)
    // Suppress text selection and show the grabbing cursor everywhere
    // for the duration of the drag.
    const prevUserSelect = document.body.style.userSelect
    const prevCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = "grabbing"
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", resetDrag)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor = prevCursor
    }
  }, [drag, onReorderVoices, resetDrag])

  /**
   * How far a resting card must budge to open a gap at the drop position.
   * Cards between the origin and the target slide one slot toward the
   * origin; everything else stays put.
   */
  const shiftFor = (index: number) => {
    if (!drag || overIndex === null) return 0
    const { fromIndex, step } = drag
    if (index === fromIndex) return 0
    if (overIndex > fromIndex && index > fromIndex && index <= overIndex) {
      return -step
    }
    if (overIndex < fromIndex && index >= overIndex && index < fromIndex) {
      return step
    }
    return 0
  }

  /** One color per voice, so the palette size is the voice ceiling. */
  const canAddVoice = voices.length < VOICE_COLORS.length

  /** Keyboard equivalent of dragging: swap with the neighboring voice. */
  const moveByOffset = (id: string, direction: -1 | 1) => {
    const index = voices.findIndex((v) => v.id === id)
    const target = voices[index + direction]
    if (target) onReorderVoices(id, target.id)
  }

  const draggedVoice = drag ? voices.find((v) => v.id === drag.id) : null

  return (
    <aside
      className={cn(
        "glass-panel flex w-full min-w-0 shrink flex-col overflow-hidden rounded-xl border border-border/70 transition-[width,height] duration-200 ease-out md:h-full md:shrink-0",
        collapsed ? "h-11 md:w-11" : "h-64 md:w-[340px]",
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-border/60 px-3 py-2.5",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Voices
          </span>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={onAddVoice}
                    disabled={!canAddVoice}
                    aria-label="Add voice"
                  >
                    <Plus />
                  </Button>
                }
              />
              <TooltipContent>
                {canAddVoice
                  ? "Add a voice"
                  : `Maximum of ${VOICE_COLORS.length} voices reached`}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setCollapsed((c) => !c)}
                  aria-label={collapsed ? "Expand voices panel" : "Collapse voices panel"}
                  aria-pressed={collapsed}
                >
                  {collapsed ? <PanelRightOpen /> : <PanelRightClose />}
                </Button>
              }
            />
            <TooltipContent side={collapsed ? "right" : "bottom"}>
              {collapsed ? "Expand voices panel" : "Collapse voices panel"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {!collapsed && (
        <ScrollArea className="h-full flex-1">
          <div ref={listRef} className="flex flex-col gap-2.5 p-3">
            {voices.map((voice, index) => (
              <VoiceTrack
                key={voice.id}
                voice={voice}
                isActive={voice.id === activeVoiceId}
                isPlaceholder={drag?.id === voice.id}
                shift={shiftFor(index)}
                animateShift={drag !== null}
                canDelete={voices.length > 1}
                onSelect={() => onSelectVoice(voice.id)}
                onUpdate={(patch) => onUpdateVoice(voice.id, patch)}
                onDelete={() => onDeleteVoice(voice.id)}
                onDragStart={(e) => beginDrag(voice.id, index, e)}
                onMove={(direction) => moveByOffset(voice.id, direction)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* The dragged card itself, floating under the cursor. Portalled to
          the body so the scroll container cannot clip it. */}
      {drag &&
        draggedVoice &&
        createPortal(
          <div
            data-drag-ghost=""
            className="pointer-events-none fixed z-50"
            style={{
              left: pointer.x - drag.grabX,
              top: pointer.y - drag.grabY,
              width: drag.width,
            }}
          >
            <VoiceTrack
              voice={draggedVoice}
              isActive={draggedVoice.id === activeVoiceId}
              isGhost
              canDelete={false}
              onSelect={() => {}}
              onUpdate={() => {}}
              onDelete={() => {}}
              onDragStart={() => {}}
              onMove={() => {}}
            />
          </div>,
          document.body,
        )}
    </aside>
  )
}
