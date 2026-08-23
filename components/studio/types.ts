export type ClefType = "treble" | "bass" | "alto" | "tenor"

export interface Voice {
  id: string
  name: string
  clef: ClefType
  presetId: string
  volume: number
  pan: number
  muted: boolean
  solo: boolean
  color: string
  notes: number[]
}

export interface ChiptunePreset {
  id: string
  label: string
  category: string
}

export const CLEF_LABEL: Record<ClefType, string> = {
  treble: "Treble",
  alto: "Alto",
  tenor: "Tenor",
  bass: "Bass",
}

export const CLEF_OPTIONS: ClefType[] = ["treble", "alto", "tenor", "bass"]

// Vertical position (in staff-line units, where 0 = middle line and
// positive values move toward the bottom line) at which each clef's
// glyph is centered, matching standard music engraving placement.
export const CLEF_LINE_OFFSET: Record<ClefType, number> = {
  treble: 1, // curls around the second line from the bottom (G4)
  alto: 0, // centered on the middle line (C4)
  tenor: -1, // centered on the fourth line from the bottom (C4)
  bass: -1, // dots straddle the fourth line from the bottom (F3)
}

export interface TempoMarking {
  name: string
  bpm: number
}

// Fixed classical tempo markings, ordered slowest to fastest, spanning
// (and including) Largo through Presto.
export const TEMPO_MARKINGS: TempoMarking[] = [
  { name: "Largo", bpm: 50 },
  { name: "Larghetto", bpm: 60 },
  { name: "Adagio", bpm: 70 },
  { name: "Adagietto", bpm: 76 },
  { name: "Andante", bpm: 92 },
  { name: "Andantino", bpm: 100 },
  { name: "Moderato", bpm: 112 },
  { name: "Allegretto", bpm: 120 },
  { name: "Allegro", bpm: 144 },
  { name: "Vivace", bpm: 168 },
  { name: "Presto", bpm: 184 },
]

const PITCH_CLASSES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
]

// All 24 major and minor keys, walking every half step from C to B.
export const MUSICAL_KEYS: string[] = PITCH_CLASSES.flatMap((pitch) => [
  `${pitch} major`,
  `${pitch} minor`,
])

export type NoteDurationId = "32nd" | "16th" | "8th" | "quarter" | "half" | "whole"

export interface NotationOption {
  id: string
  label: string
}

// Ordered shortest (32nd) to longest (whole) per standard notation.
export const NOTE_DURATIONS: { id: NoteDurationId; label: string }[] = [
  { id: "32nd", label: "32nd note" },
  { id: "16th", label: "16th note" },
  { id: "8th", label: "8th note" },
  { id: "quarter", label: "Quarter note" },
  { id: "half", label: "Half note" },
  { id: "whole", label: "Whole note" },
]

// Matching rest durations, same ordering.
export const REST_DURATIONS: { id: NoteDurationId; label: string }[] = [
  { id: "32nd", label: "32nd rest" },
  { id: "16th", label: "16th rest" },
  { id: "8th", label: "8th rest" },
  { id: "quarter", label: "Quarter rest" },
  { id: "half", label: "Half rest" },
  { id: "whole", label: "Whole rest" },
]

export const ACCIDENTALS: NotationOption[] = [
  { id: "double-flat", label: "Double flat" },
  { id: "flat", label: "Flat" },
  { id: "natural", label: "Natural" },
  { id: "sharp", label: "Sharp" },
  { id: "double-sharp", label: "Double sharp" },
]

export const CHIPTUNE_PRESETS: ChiptunePreset[] = [
  { id: "pulse-12", label: "Pulse 12.5%", category: "Pulse & Square" },
  { id: "pulse-25", label: "Pulse 25%", category: "Pulse & Square" },
  { id: "pulse-50", label: "Square 50%", category: "Pulse & Square" },
  { id: "pulse-75", label: "Pulse 75%", category: "Pulse & Square" },
  { id: "pulse-sweep", label: "Pulse Sweep", category: "Pulse & Square" },
  { id: "tri-clean", label: "Triangle Clean", category: "Triangle" },
  { id: "tri-soft", label: "Triangle Soft", category: "Triangle" },
  { id: "tri-detuned", label: "Triangle Detuned", category: "Triangle" },
  { id: "saw-bright", label: "Sawtooth Bright", category: "Sawtooth" },
  { id: "saw-warm", label: "Sawtooth Warm", category: "Sawtooth" },
  { id: "saw-stack", label: "Sawtooth Stack", category: "Sawtooth" },
  { id: "nes-pulse1", label: "NES Pulse 1", category: "Console — NES" },
  { id: "nes-pulse2", label: "NES Pulse 2", category: "Console — NES" },
  { id: "nes-triangle", label: "NES Triangle", category: "Console — NES" },
  { id: "nes-noise", label: "NES Noise", category: "Console — NES" },
  { id: "nes-dpcm", label: "NES DPCM Sample", category: "Console — NES" },
  { id: "gb-pulse-a", label: "Game Boy Pulse A", category: "Console — Game Boy" },
  { id: "gb-pulse-b", label: "Game Boy Pulse B", category: "Console — Game Boy" },
  { id: "gb-wave", label: "Game Boy Wave", category: "Console — Game Boy" },
  { id: "gb-noise", label: "Game Boy Noise", category: "Console — Game Boy" },
  { id: "sid-pulse", label: "SID Pulse", category: "Console — SID (C64)" },
  { id: "sid-saw", label: "SID Sawtooth", category: "Console — SID (C64)" },
  { id: "sid-triangle", label: "SID Triangle", category: "Console — SID (C64)" },
  { id: "sid-ringmod", label: "SID Ring Mod", category: "Console — SID (C64)" },
  { id: "sid-noise", label: "SID Noise", category: "Console — SID (C64)" },
  { id: "fm-bell", label: "FM Bell", category: "FM Synth" },
  { id: "fm-bass", label: "FM Bass", category: "FM Synth" },
  { id: "fm-organ", label: "FM Organ", category: "FM Synth" },
  { id: "fm-brass", label: "FM Brass Stab", category: "FM Synth" },
  { id: "arcade-lead", label: "Arcade Lead", category: "Arcade" },
  { id: "arcade-bass", label: "Arcade Bass", category: "Arcade" },
  { id: "arcade-pad", label: "Arcade Pad", category: "Arcade" },
  { id: "arcade-fx", label: "Arcade Power-Up", category: "Arcade" },
  { id: "bell-8bit", label: "8-Bit Bell", category: "Bells & Chimes" },
  { id: "chime-8bit", label: "8-Bit Chime", category: "Bells & Chimes" },
  { id: "organ-8bit", label: "8-Bit Organ", category: "Bells & Chimes" },
  { id: "crush-4bit", label: "Crushed 4-Bit", category: "Lo-Fi & Noise" },
  { id: "crush-8bit", label: "Crushed 8-Bit", category: "Lo-Fi & Noise" },
  { id: "tape-lofi", label: "Lo-Fi Tape", category: "Lo-Fi & Noise" },
  { id: "kick-8bit", label: "8-Bit Kick", category: "Percussion" },
  { id: "snare-8bit", label: "8-Bit Snare", category: "Percussion" },
  { id: "hat-8bit", label: "8-Bit Hi-Hat", category: "Percussion" },
]

export const PRESET_CATEGORIES = Array.from(
  new Set(CHIPTUNE_PRESETS.map((p) => p.category)),
)

export const INITIAL_VOICES: Voice[] = [
  {
    id: "soprano",
    name: "Soprano",
    clef: "treble",
    presetId: "pulse-25",
    volume: 78,
    pan: -12,
    muted: false,
    solo: false,
    color: "var(--chart-1)",
    notes: [67, 69, 71, 72, 71, 69, 67, 65, 67, 71, 74, 72, 71, 69, 67, 65],
  },
  {
    id: "alto",
    name: "Alto",
    clef: "alto",
    presetId: "tri-clean",
    volume: 66,
    pan: 10,
    muted: false,
    solo: false,
    color: "var(--chart-2)",
    notes: [60, 62, 64, 65, 64, 62, 64, 60, 59, 60, 62, 64, 65, 64, 62, 60],
  },
  {
    id: "tenor",
    name: "Tenor",
    clef: "tenor",
    presetId: "gb-pulse-a",
    volume: 60,
    pan: -6,
    muted: false,
    solo: false,
    color: "var(--chart-3)",
    notes: [55, 57, 59, 57, 55, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 53],
  },
  {
    id: "bass",
    name: "Bass",
    clef: "bass",
    presetId: "sid-saw",
    volume: 70,
    pan: 4,
    muted: false,
    solo: false,
    color: "var(--chart-4)",
    notes: [48, 47, 45, 43, 45, 47, 48, 50, 43, 45, 48, 47, 45, 43, 41, 48],
  },
]
