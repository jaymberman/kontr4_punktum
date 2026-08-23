"use client"

import { useEffect, useRef, useState } from "react"
import { Redo2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { StaffRow, NOTE_WIDTH, CLEF_WIDTH } from "@/components/studio/staff-row"
import { NotationToolbar } from "@/components/studio/notation-toolbar"
import type { Voice } from "@/components/studio/types"
import { cn } from "@/lib/utils"

export function StaffCanvas({
  voices,
  activeVoiceId,
  isPlaying,
  playheadIndex,
  measureCount,
  beatsPerMeasure,
  songName,
  onSongNameChange,
  onUpdateVoice,
}: {
  voices: Voice[]
  activeVoiceId: string | null
  isPlaying: boolean
  playheadIndex: number
  measureCount: number
  beatsPerMeasure: number
  songName: string
  onSongNameChange: (name: string) => void
  onUpdateVoice: (id: string, patch: Partial<Voice>) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalNotes = measureCount * beatsPerMeasure
  const measures = Array.from({ length: measureCount }, (_, i) => i + 1)
  const [isEditingName, setIsEditingName] = useState(false)

  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return
    const targetX = playheadIndex * NOTE_WIDTH - 200
    scrollRef.current.scrollTo({ left: Math.max(0, targetX), behavior: "smooth" })
  }, [playheadIndex, isPlaying])

  return (
    <div className="glass-panel flex h-full flex-col overflow-hidden rounded-xl border border-border/70 shadow-2xl">
      <div className="flex items-center gap-4 overflow-x-auto border-b border-border/60 bg-card/60 px-4 py-2.5">
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
              className="h-7 max-w-64 text-xs font-semibold uppercase tracking-wider"
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

        <NotationToolbar />
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-auto">
        <div
          className="sticky top-0 z-10 flex border-b border-border/60 bg-card/80"
          style={{ width: 96 + CLEF_WIDTH + totalNotes * NOTE_WIDTH }}
        >
          <div className="w-24 shrink-0 border-r border-border/60 sm:w-28" />
          <div className="relative flex flex-1">
            <div className="shrink-0" style={{ width: CLEF_WIDTH }} />
            {measures.map((m) => (
              <div
                key={m}
                className="flex shrink-0 items-center border-r border-border/40 px-2 py-1"
                style={{ width: NOTE_WIDTH * beatsPerMeasure }}
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {m}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="relative"
          style={{ width: 96 + CLEF_WIDTH + totalNotes * NOTE_WIDTH }}
        >
          {voices.map((voice) => (
            <StaffRow
              key={voice.id}
              voice={voice}
              isActive={voice.id === activeVoiceId}
              playheadIndex={playheadIndex}
              onUpdate={(patch) => onUpdateVoice(voice.id, patch)}
            />
          ))}

          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 w-px bg-accent transition-[left] duration-150",
              isPlaying ? "shadow-[0_0_12px_var(--accent)]" : "opacity-0",
            )}
            style={{ left: 96 + CLEF_WIDTH + playheadIndex * NOTE_WIDTH + NOTE_WIDTH / 2 }}
          />
        </div>
      </div>
    </div>
  )
}
