"use client"

import { Volume2, VolumeX } from "lucide-react"
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
import { CHIPTUNE_PRESETS, PRESET_CATEGORIES, type Voice } from "@/components/studio/types"
import { cn } from "@/lib/utils"

export function VoiceTrack({
  voice,
  isActive,
  onSelect,
  onUpdate,
}: {
  voice: Voice
  isActive: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<Voice>) => void
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "glass-surface flex flex-col gap-3 rounded-lg border px-3 py-3 transition-colors",
        isActive ? "border-primary/60" : "border-border/60 hover:border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: voice.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {voice.name}
          </span>
        </div>
      </div>

      <Select
        value={voice.presetId}
        onValueChange={(v) => v && onUpdate({ presetId: v })}
      >
        <SelectTrigger className="w-full" size="sm" onClick={(e) => e.stopPropagation()}>
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

      <div
        className="flex items-center gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        {voice.muted || voice.volume === 0 ? (
          <VolumeX className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Slider
          value={[voice.volume]}
          onValueChange={(value) =>
            onUpdate({ volume: Array.isArray(value) ? value[0] : value })
          }
          max={100}
          step={1}
          style={{ "--voice-color": voice.color } as React.CSSProperties}
          className="flex-1 [&_[data-slot=slider-range]]:bg-[var(--voice-color)]"
        />
        <span className="w-7 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {voice.volume}
        </span>
      </div>

      <div
        className="flex items-center gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="w-3.5 shrink-0 text-center text-[10px] text-muted-foreground">
          L
        </span>
        <Slider
          value={[voice.pan]}
          onValueChange={(value) =>
            onUpdate({ pan: Array.isArray(value) ? value[0] : value })
          }
          min={-50}
          max={50}
          step={1}
          className="flex-1"
        />
        <span className="w-3.5 shrink-0 text-center text-[10px] text-muted-foreground">
          R
        </span>
      </div>
    </div>
  )
}
