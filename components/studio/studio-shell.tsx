"use client"

import { useEffect, useRef, useState } from "react"
import { AppHeader } from "@/components/studio/app-header"
import { StaffCanvas } from "@/components/studio/staff-canvas"
import { RightPanel } from "@/components/studio/right-panel"
import {
  INITIAL_VOICES,
  TEMPO_MARKINGS,
  type Voice,
} from "@/components/studio/types"

const BEATS_PER_MEASURE = 4
const MEASURE_COUNT = 4
const TOTAL_NOTES = BEATS_PER_MEASURE * MEASURE_COUNT

export function StudioShell() {
  const [voices, setVoices] = useState<Voice[]>(INITIAL_VOICES)
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(
    INITIAL_VOICES[0]?.id ?? null,
  )
  const [songName, setSongName] = useState("Prelude 1")
  const [musicalKey, setMusicalKey] = useState("D minor")
  const [tempo, setTempo] = useState("Andante")
  const [timeSignature, setTimeSignature] = useState("4/4")
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [playheadIndex, setPlayheadIndex] = useState(0)
  const [masterVolume, setMasterVolume] = useState(78)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const bpm = TEMPO_MARKINGS.find((t) => t.name === tempo)?.bpm ?? 92

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    const msPerBeat = 60000 / bpm
    intervalRef.current = setInterval(() => {
      setPlayheadIndex((prev) => {
        const next = prev + 1
        if (next >= TOTAL_NOTES) {
          if (isLooping) return 0
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, msPerBeat)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, bpm, isLooping])

  const handleUpdateVoice = (id: string, patch: Partial<Voice>) => {
    setVoices((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    )
  }

  const handleStop = () => {
    setIsPlaying(false)
    setPlayheadIndex(0)
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-noise">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,oklch(0.3_0.06_255_/_35%),transparent_55%),radial-gradient(circle_at_85%_90%,oklch(0.28_0.07_195_/_25%),transparent_50%)]" />

      <AppHeader
        musicalKey={musicalKey}
        onKeyChange={setMusicalKey}
        tempo={tempo}
        onTempoChange={setTempo}
        timeSignature={timeSignature}
        onTimeSignatureChange={setTimeSignature}
        isPlaying={isPlaying}
        isLooping={isLooping}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStop={handleStop}
        onToggleLoop={() => setIsLooping((l) => !l)}
        masterVolume={masterVolume}
        onMasterVolumeChange={setMasterVolume}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <div className="min-h-[280px] min-w-0 flex-1 md:min-h-0">
            <StaffCanvas
              voices={voices}
              activeVoiceId={activeVoiceId}
              isPlaying={isPlaying}
              playheadIndex={playheadIndex}
              measureCount={MEASURE_COUNT}
              beatsPerMeasure={BEATS_PER_MEASURE}
              songName={songName}
              onSongNameChange={setSongName}
              onUpdateVoice={handleUpdateVoice}
            />
          </div>

          <RightPanel
            voices={voices}
            activeVoiceId={activeVoiceId}
            isPlaying={isPlaying}
            onSelectVoice={setActiveVoiceId}
            onUpdateVoice={handleUpdateVoice}
          />
        </div>


      </div>
    </div>
  )
}
