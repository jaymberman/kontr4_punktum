"use client"

import { useState } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ACCIDENTALS, NOTE_DURATIONS, REST_DURATIONS } from "@/components/studio/types"
import {
  AccidentalIcon,
  NoteIcon,
  RestIcon,
  TieIcon,
  type AccidentalId,
} from "@/components/studio/notation-icons"

export function NotationToolbar() {
  const [noteDuration, setNoteDuration] = useState<string | null>("quarter")
  const [restDuration, setRestDuration] = useState<string | null>(null)
  const [accidental, setAccidental] = useState<string | null>(null)
  const [tieActive, setTieActive] = useState(false)

  return (
    <div className="flex shrink-0 items-center gap-3">
      <ToggleGroup
        size="sm"
        spacing={0}
        variant="outline"
        value={noteDuration ? [noteDuration] : []}
        onValueChange={(v) => setNoteDuration(v[0] ?? null)}
      >
        {NOTE_DURATIONS.map((d) => (
          <Tooltip key={d.id}>
            <TooltipTrigger
              render={
                <ToggleGroupItem value={d.id} aria-label={d.label}>
                  <NoteIcon duration={d.id} className="size-4" />
                </ToggleGroupItem>
              }
            />
            <TooltipContent>{d.label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="h-7" />

      <ToggleGroup
        size="sm"
        spacing={0}
        variant="outline"
        value={restDuration ? [restDuration] : []}
        onValueChange={(v) => setRestDuration(v[0] ?? null)}
      >
        {REST_DURATIONS.map((d) => (
          <Tooltip key={d.id}>
            <TooltipTrigger
              render={
                <ToggleGroupItem value={d.id} aria-label={d.label}>
                  <RestIcon duration={d.id} className="text-xl" />
                </ToggleGroupItem>
              }
            />
            <TooltipContent>{d.label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="h-7" />

      <ToggleGroup
        size="sm"
        spacing={0}
        variant="outline"
        value={accidental ? [accidental] : []}
        onValueChange={(v) => setAccidental(v[0] ?? null)}
      >
        {ACCIDENTALS.map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger
              render={
                <ToggleGroupItem value={a.id} aria-label={a.label}>
                  <AccidentalIcon id={a.id as AccidentalId} className="text-xl" />
                </ToggleGroupItem>
              }
            />
            <TooltipContent>{a.label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="h-7" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              size="sm"
              variant="outline"
              pressed={tieActive}
              onPressedChange={setTieActive}
              aria-label="Tie"
              className="data-pressed:bg-accent data-pressed:text-accent-foreground"
            >
              <TieIcon className="size-4" />
            </Toggle>
          }
        />
        <TooltipContent>Tie notes together</TooltipContent>
      </Tooltip>
    </div>
  )
}
