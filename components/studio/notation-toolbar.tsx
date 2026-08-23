"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ACCIDENTALS,
  NOTE_DURATIONS,
  OCTAVE_SHIFTS,
  REST_DURATIONS,
  type OctaveShift,
} from "@/components/studio/types"
import {
  AccidentalIcon,
  NoteIcon,
  RestIcon,
  TieIcon,
  type AccidentalId,
} from "@/components/studio/notation-icons"

export function NotationToolbar({
  measureCount,
  selectedMeasure,
  activeOctaveShift,
  onAddMeasures,
  onSetOctaveShift,
}: {
  measureCount: number
  selectedMeasure: number | null
  activeOctaveShift: OctaveShift | null
  onAddMeasures: (count: number) => void
  onSetOctaveShift: (shift: OctaveShift) => void
}) {
  const [noteDuration, setNoteDuration] = useState<string | null>("quarter")
  const [restDuration, setRestDuration] = useState<string | null>(null)
  const [accidental, setAccidental] = useState<string | null>(null)
  const [tieActive, setTieActive] = useState(false)
  /** Raw text, so the field can be cleared while typing a new number. */
  const [measuresToAdd, setMeasuresToAdd] = useState("1")

  const parsed = Number.parseInt(measuresToAdd, 10)
  const addCount = Number.isFinite(parsed) && parsed > 0 ? parsed : 1

  return (
    <div className="flex items-center gap-3">
      <ToggleGroup
        size="sm"
        spacing={0}
        variant="outline"
        className="shrink-0"
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

      <Separator orientation="vertical" className="h-7 shrink-0" />

      <ToggleGroup
        size="sm"
        spacing={0}
        variant="outline"
        className="shrink-0"
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

      <Separator orientation="vertical" className="h-7 shrink-0" />

      <ToggleGroup
        size="sm"
        spacing={0}
        variant="outline"
        className="shrink-0"
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

      <Separator orientation="vertical" className="h-7 shrink-0" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              size="sm"
              variant="outline"
              pressed={tieActive}
              onPressedChange={setTieActive}
              aria-label="Tie"
              className="shrink-0 data-pressed:bg-accent data-pressed:text-accent-foreground"
            >
              <TieIcon className="size-4" />
            </Toggle>
          }
        />
        <TooltipContent>Tie notes together</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-7 shrink-0" />

      {/* Octave transposition. Applies to the selected measure of the
          active voice, so a measure must be selected first. */}
      <ToggleGroup
        size="sm"
        spacing={0}
        variant="outline"
        className="shrink-0"
        value={activeOctaveShift ? [activeOctaveShift] : []}
        onValueChange={(v) => {
          const next = v[0] as OctaveShift | undefined
          if (next) onSetOctaveShift(next)
          else if (activeOctaveShift) onSetOctaveShift(activeOctaveShift)
        }}
      >
        {OCTAVE_SHIFTS.map((o) => (
          <Tooltip key={o.id}>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  value={o.id}
                  aria-label={`${o.label} — ${o.hint}`}
                  disabled={selectedMeasure === null}
                  className="px-2 font-serif text-xs italic"
                >
                  {o.label}
                </ToggleGroupItem>
              }
            />
            <TooltipContent>
              {selectedMeasure === null
                ? `Select a measure to apply ${o.label}`
                : `${o.hint} (measure ${selectedMeasure + 1})`}
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="h-7 shrink-0" />

      {/* Add measures. The score length is unbounded, so this only
          enforces that the count is a natural number. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Measures
        </span>
        <Input
          type="number"
          min={1}
          step={1}
          value={measuresToAdd}
          onChange={(e) => setMeasuresToAdd(e.target.value)}
          onBlur={() => setMeasuresToAdd(String(addCount))}
          aria-label="Number of measures to add"
          className="h-7 w-14 px-2 text-center font-mono text-xs"
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={() => onAddMeasures(addCount)}
                aria-label={`Add ${addCount} measure${addCount === 1 ? "" : "s"}`}
              >
                <Plus className="size-3.5" />
                <span className="text-xs">Add</span>
              </Button>
            }
          />
          <TooltipContent>
            {`Add ${addCount} measure${addCount === 1 ? "" : "s"} (${measureCount} in score)`}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
