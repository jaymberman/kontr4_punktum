"use client"

import {
  Check,
  GripVertical,
  MoreVertical,
  Palette,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { PanKnob } from "@/components/studio/pan-knob"
import {
  CHIPTUNE_PRESETS,
  CLEF_LABEL,
  CLEF_OPTIONS,
  PRESET_CATEGORIES,
  VOICE_COLORS,
  type Voice,
} from "@/components/studio/types"
import { cn } from "@/lib/utils"

export function VoiceTrack({
  voice,
  isActive,
  isPlaceholder = false,
  isGhost = false,
  shift = 0,
  animateShift = false,
  canDelete,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onMove,
}: {
  voice: Voice
  isActive: boolean
  /** The dragged card's original slot: holds space, but stays invisible. */
  isPlaceholder?: boolean
  /** The floating copy that follows the cursor. */
  isGhost?: boolean
  /** Pixels to budge vertically so a gap opens at the drop position. */
  shift?: number
  animateShift?: boolean
  canDelete: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<Voice>) => void
  onDelete: () => void
  onDragStart: (e: React.PointerEvent) => void
  onMove: (direction: -1 | 1) => void
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      data-voice-id={isGhost ? undefined : voice.id}
      onClick={onSelect}
      aria-hidden={isGhost || isPlaceholder ? true : undefined}
      style={{ transform: shift ? `translateY(${shift}px)` : undefined }}
      className={cn(
        "glass-surface flex flex-col gap-3 rounded-lg border px-3 py-3",
        isActive ? "border-primary/60" : "border-border/60",
        !isGhost && !isPlaceholder && "hover:border-border",
        animateShift
          ? "transition-transform duration-200 ease-out"
          : "transition-colors",
        isPlaceholder && "invisible",
        isGhost &&
          "pointer-events-none rotate-1 scale-[1.02] border-primary/70 bg-card opacity-80 shadow-2xl grayscale",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          tabIndex={isGhost ? -1 : undefined}
          aria-label={`Reorder ${voice.name}. Use arrow up and arrow down keys to move.`}
          /* Only the handle starts a drag, so the name field and the
             volume and pan sliders inside the card stay usable. */
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDragStart(e)
          }}
          onClick={stop}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault()
              onMove(-1)
            } else if (e.key === "ArrowDown") {
              e.preventDefault()
              onMove(1)
            }
          }}
          className="-ml-1 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
        >
          <GripVertical className="size-3.5" />
        </button>

        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: voice.color }}
          aria-hidden
        />

        {/* Clef sits next to the name: both describe what the voice is. */}
        <Select
          value={voice.clef}
          onValueChange={(v) => v && onUpdate({ clef: v as Voice["clef"] })}
        >
          <SelectTrigger
            size="sm"
            className="h-6 w-[74px] shrink-0 gap-1 rounded-full border-none bg-secondary px-2 text-[10px] uppercase tracking-wide text-secondary-foreground data-[size=sm]:h-6"
            onClick={stop}
            onPointerDown={stop}
            aria-label={`${voice.name} clef`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLEF_OPTIONS.map((clef) => (
              <SelectItem key={clef} value={clef}>
                {CLEF_LABEL[clef]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 shrink-0 text-muted-foreground"
                onClick={stop}
                aria-label={`${voice.name} options`}
              >
                <MoreVertical className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette />
                Change color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-auto">
                <div className="grid grid-cols-5 gap-0.5">
                  {VOICE_COLORS.map((color) => {
                    const isCurrent = color === voice.color
                    return (
                      <DropdownMenuItem
                        key={color}
                        className="justify-center p-1"
                        aria-label={`Set color ${color}`}
                        onClick={() => onUpdate({ color })}
                      >
                        <span
                          className={cn(
                            "flex size-4 items-center justify-center rounded-full ring-offset-1 ring-offset-popover",
                            isCurrent && "ring-2 ring-foreground/70",
                          )}
                          style={{ background: color }}
                        >
                          {isCurrent && (
                            <Check className="size-2.5 text-background" />
                          )}
                        </span>
                      </DropdownMenuItem>
                    )
                  })}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              disabled={!canDelete}
              onClick={onDelete}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Pushed flush to the card's right edge, mirroring the reorder
            handle's position flush against the left edge. L/R flank the
            knob the same way they used to flank the old pan slider. */}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <span
            className="w-2.5 shrink-0 text-center text-[10px] text-muted-foreground"
            aria-hidden
          >
            L
          </span>
          <PanKnob
            value={voice.pan}
            onChange={(pan) => onUpdate({ pan })}
            color={voice.color}
            label={`${voice.name} stereo pan`}
            disabled={isGhost}
          />
          <span
            className="w-2.5 shrink-0 text-center text-[10px] text-muted-foreground"
            aria-hidden
          >
            R
          </span>
        </span>
      </div>

      <Select
        value={voice.presetId}
        onValueChange={(v) => v && onUpdate({ presetId: v })}
      >
        <SelectTrigger className="w-full" size="sm" onClick={stop}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_CATEGORIES.map((category, idx) => (
            <SelectGroup key={category}>
              {idx !== 0 && <SelectSeparator />}
              <SelectLabel>{category}</SelectLabel>
              {CHIPTUNE_PRESETS.filter((p) => p.category === category).map(
                (preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ),
              )}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2.5" onClick={stop}>
        <button
          type="button"
          tabIndex={isGhost ? -1 : undefined}
          onClick={(e) => {
            stop(e)
            onUpdate({ muted: !voice.muted })
          }}
          aria-label={voice.muted ? `Unmute ${voice.name}` : `Mute ${voice.name}`}
          aria-pressed={voice.muted}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
        >
          {voice.muted || voice.volume === 0 ? (
            <VolumeX className="size-3.5" />
          ) : (
            <Volume2 className="size-3.5" />
          )}
        </button>
        <Slider
          value={[voice.volume]}
          onValueChange={(value) =>
            onUpdate({ volume: Array.isArray(value) ? value[0] : value })
          }
          max={100}
          step={1}
          aria-label={`${voice.name} volume`}
          style={{ "--voice-color": voice.color } as React.CSSProperties}
          className="flex-1 [&_[data-slot=slider-range]]:bg-[var(--voice-color)]"
        />
        <span className="w-7 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {voice.volume}
        </span>
      </div>
    </div>
  )
}
