"use client"

import { ChevronDown, Download, FileAudio, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Voice } from "@/components/studio/types"
import { cn } from "@/lib/utils"

const EXPORT_FORMATS = [
  { id: "wav", label: "WAV — lossless", ext: ".wav" },
  { id: "flac", label: "FLAC — compressed lossless", ext: ".flac" },
  { id: "mp3", label: "MP3 — 320 kbps", ext: ".mp3" },
]

export function TimelinePanel({
  voices,
  measureCount,
  playheadIndex,
  totalNotes,
}: {
  voices: Voice[]
  measureCount: number
  playheadIndex: number
  totalNotes: number
}) {
  const progress = totalNotes > 0 ? playheadIndex / totalNotes : 0

  return (
    <div className="glass-panel flex flex-col gap-3 rounded-xl border border-border/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {measureCount} measures
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Save data-icon="inline-start" />
            Save project
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm">
                  <Download data-icon="inline-start" />
                  Export
                  <ChevronDown data-icon="inline-end" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Export mixdown as</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {EXPORT_FORMATS.map((format) => (
                  <DropdownMenuItem key={format.id}>
                    <FileAudio data-icon="inline-start" />
                    <span className="whitespace-nowrap">{format.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {voices.map((voice) => (
          <div key={voice.id} className="flex items-center gap-2">
            <span className="w-14 shrink-0 truncate text-[10px] text-muted-foreground">
              {voice.name}
            </span>
            <div className="relative flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="flex h-full w-full items-center gap-px px-px"
                aria-hidden
              >
                {voice.notes.map((_, i) => (
                  <span
                    key={i}
                    className="h-full flex-1 rounded-[1px]"
                    style={{
                      background: voice.color,
                      opacity: voice.muted ? 0.15 : 0.4 + (i % 3) * 0.15,
                    }}
                  />
                ))}
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-accent shadow-[0_0_6px_var(--accent)]"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full bg-primary transition-[width]")}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}
