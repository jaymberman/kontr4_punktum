"use client"

import {
  AudioLines,
  ChevronDown,
  FileDown,
  FilePlus,
  FileUp,
  Pause,
  Play,
  Repeat,
  Save,
  Settings,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { MUSICAL_KEYS, TEMPO_MARKINGS } from "@/components/studio/types"

const TIME_SIGNATURES = ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"]

export function AppHeader({
  musicalKey,
  onKeyChange,
  tempo,
  onTempoChange,
  timeSignature,
  onTimeSignatureChange,
  isPlaying,
  isLooping,
  onTogglePlay,
  onStop,
  onToggleLoop,
  masterVolume,
  onMasterVolumeChange,
}: {
  musicalKey: string
  onKeyChange: (v: string) => void
  tempo: string
  onTempoChange: (v: string) => void
  timeSignature: string
  onTimeSignatureChange: (v: string) => void
  isPlaying: boolean
  isLooping: boolean
  onTogglePlay: () => void
  onStop: () => void
  onToggleLoop: () => void
  masterVolume: number
  onMasterVolumeChange: (v: number) => void
}) {
  return (
    <header className="glass-panel flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2.5 pr-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
          <AudioLines className="size-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-sm font-semibold tracking-tight">
            Kontr4 Punktum
          </span>
          <span className="text-[11px] text-muted-foreground">
            8-bit counterpoint studio
          </span>
        </div>
      </div>

      <Separator orientation="vertical" className="hidden h-8 sm:block" />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="secondary" size="sm">
              File
              <ChevronDown data-icon="inline-end" />
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem>
            <FilePlus />
            New
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Save />
            Save
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileUp />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileDown />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings />
            Config
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="hidden h-8 sm:block" />

      <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/50 p-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={isPlaying ? "default" : "secondary"}
                size="icon"
                className="size-8"
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={onTogglePlay}
              >
                {isPlaying ? <Pause /> : <Play />}
              </Button>
            }
          />
          <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                aria-label="Stop"
                onClick={onStop}
              >
                <Square />
              </Button>
            }
          />
          <TooltipContent>Stop</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={isLooping ? "default" : "secondary"}
                size="icon"
                className="size-8"
                aria-label="Toggle loop"
                onClick={onToggleLoop}
              >
                <Repeat />
              </Button>
            }
          />
          <TooltipContent>Loop playback</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="hidden h-8 sm:block" />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Key</span>
          <Select value={musicalKey} onValueChange={(v) => v && onKeyChange(v)}>
            <SelectTrigger className="w-[118px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MUSICAL_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Tempo</span>
          <Select value={tempo} onValueChange={(v) => v && onTempoChange(v)}>
            <SelectTrigger className="w-[128px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TEMPO_MARKINGS.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name} — {t.bpm} BPM
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Meter</span>
          <Select value={timeSignature} onValueChange={(v) => v && onTimeSignatureChange(v)}>
            <SelectTrigger className="w-[84px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TIME_SIGNATURES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator orientation="vertical" className="hidden h-8 sm:block" />

      <div className="flex min-w-[140px] flex-1 items-center gap-2 sm:max-w-[220px]">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={masterVolume === 0 ? "Unmute master volume" : "Mute master volume"}
                onClick={() => onMasterVolumeChange(masterVolume === 0 ? 78 : 0)}
              >
                {masterVolume === 0 ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </Button>
            }
          />
          <TooltipContent>Master volume</TooltipContent>
        </Tooltip>
        <Slider
          value={[masterVolume]}
          onValueChange={(value) =>
            onMasterVolumeChange(Array.isArray(value) ? value[0] : value)
          }
          max={100}
          step={1}
          className="flex-1"
          aria-label="Master volume"
        />
        <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {masterVolume}
        </span>
      </div>
    </header>
  )
}
