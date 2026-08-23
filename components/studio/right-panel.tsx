"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VoiceTrack } from "@/components/studio/voice-track"
import type { Voice } from "@/components/studio/types"

export function RightPanel({
  voices,
  activeVoiceId,
  onSelectVoice,
  onUpdateVoice,
}: {
  voices: Voice[]
  activeVoiceId: string | null
  isPlaying: boolean
  onSelectVoice: (id: string) => void
  onUpdateVoice: (id: string, patch: Partial<Voice>) => void
}) {
  return (
    <aside className="glass-panel flex h-64 w-full min-w-0 shrink flex-col overflow-hidden rounded-xl border border-border/70 md:h-full md:w-[340px] md:shrink-0">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Voices
        </span>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Add voice">
          <Plus />
        </Button>
      </div>

      <ScrollArea className="h-full flex-1">
        <div className="flex flex-col gap-2.5 p-3">
          {voices.map((voice) => (
            <VoiceTrack
              key={voice.id}
              voice={voice}
              isActive={voice.id === activeVoiceId}
              onSelect={() => onSelectVoice(voice.id)}
              onUpdate={(patch) => onUpdateVoice(voice.id, patch)}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
