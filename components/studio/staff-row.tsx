import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClefGlyph } from "@/components/studio/clef-icons"
import { CLEF_LABEL, CLEF_OPTIONS, type Voice } from "@/components/studio/types"
import { cn } from "@/lib/utils"

const NOTE_WIDTH = 56
const STAFF_HEIGHT = 96
const LINE_GAP = 12
const CLEF_WIDTH = 60

const CLEF_CENTER_PITCH: Record<Voice["clef"], number> = {
  treble: 71,
  alto: 60,
  tenor: 64,
  bass: 50,
}

function pitchToY(pitch: number, clef: Voice["clef"]) {
  const center = CLEF_CENTER_PITCH[clef]
  const semitoneStep = LINE_GAP / 4.2
  return -(pitch - center) * semitoneStep
}

export function StaffRow({
  voice,
  isActive,
  playheadIndex,
  onUpdate,
}: {
  voice: Voice
  isActive: boolean
  playheadIndex: number
  onUpdate: (patch: Partial<Voice>) => void
}) {
  const lines = [-2, -1, 0, 1, 2]

  return (
    <div
      className={cn(
        "relative flex items-stretch border-b border-border/60 transition-colors last:border-b-0",
        isActive ? "bg-primary/[0.04]" : "",
      )}
      style={{ height: STAFF_HEIGHT }}
    >
      <div
        className="flex w-24 shrink-0 flex-col items-center justify-center gap-1.5 border-r border-border/60 bg-card/40 px-2 py-2 sm:w-28"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          value={voice.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-6 w-full border-none bg-transparent p-0 text-center text-[11px] font-semibold shadow-none focus-visible:ring-1"
          aria-label="Voice name"
        />
        <Select value={voice.clef} onValueChange={(v) => onUpdate({ clef: v as Voice["clef"] })}>
          <SelectTrigger
            size="sm"
            className="h-5 w-fit gap-1 rounded-full border-none bg-secondary px-2 text-[10px] uppercase tracking-wide text-secondary-foreground data-[size=sm]:h-5"
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
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-x-0"
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          {lines.map((offset) => (
            <div
              key={offset}
              className="absolute inset-x-0 h-px bg-foreground/20"
              style={{ top: offset * LINE_GAP + STAFF_HEIGHT / 2 - STAFF_HEIGHT / 2 }}
            />
          ))}
        </div>

        <div className="relative flex h-full items-center">
          <div
            className="relative h-full shrink-0"
            style={{ width: CLEF_WIDTH, color: voice.color }}
          >
            <ClefGlyph clef={voice.clef} lineGap={LINE_GAP} />
          </div>
          {voice.notes.map((pitch, i) => {
            const y = pitchToY(pitch, voice.clef)
            const isBarStart = i % 4 === 0
            const isCurrent = i === playheadIndex && isActive
            return (
              <div
                key={i}
                className="relative flex h-full shrink-0 items-center justify-center"
                style={{ width: NOTE_WIDTH }}
              >
                {isBarStart && i !== 0 && (
                  <div className="absolute inset-y-2 left-0 w-px bg-foreground/25" />
                )}
                <div
                  className="relative flex items-center justify-center"
                  style={{ transform: `translateY(${y}px)` }}
                >
                  {Math.abs(y) > LINE_GAP * 2.5 && (
                    <div
                      className="absolute h-px w-5 bg-foreground/30"
                      style={{ top: "50%" }}
                    />
                  )}
                  <div
                    className={cn(
                      "size-3 rounded-full border-2 transition-all",
                      isCurrent
                        ? "scale-125 border-accent bg-accent shadow-[0_0_10px_var(--accent)]"
                        : "border-foreground/70 bg-transparent",
                    )}
                    style={
                      !isCurrent
                        ? { borderColor: voice.color, opacity: voice.muted ? 0.3 : 0.9 }
                        : undefined
                    }
                  />
                  <div
                    className="absolute h-9 w-px"
                    style={{
                      background: isCurrent ? "var(--accent)" : voice.color,
                      opacity: voice.muted ? 0.25 : 0.7,
                      top: y > 0 ? "calc(50% - 36px)" : "50%",
                      left: "calc(50% + 5px)",
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export { NOTE_WIDTH, STAFF_HEIGHT, CLEF_WIDTH }
