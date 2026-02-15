export type DrumLabel = "kick" | "snare" | "closed_hat" | "open_hat" | "clap" | "tom_low" | "tom_mid" | "tom_high" | "rim" | "perc";

export interface MelodicNoteEvent {
  id: string;
  kind?: "melodic";
  time: number;
  duration: number;
  midi: number;
  velocity: number;
  confidence: number;
  instrument: string;
  isRest?: false;
}

export interface DrumNoteEvent {
  id: string;
  kind: "drum";
  drum: DrumLabel;
  time: number;
  duration: number;
  velocity: number;
  confidence: number;
  instrument: string;
  isRest?: false;
}

export interface RestEvent {
  id: string;
  kind: "rest";
  time: number;
  duration: number;
  confidence: number;
  instrument: string;
  isRest: true;
}

export type NoteEvent = MelodicNoteEvent | DrumNoteEvent | RestEvent;

export function isDrumNote(n: NoteEvent): n is DrumNoteEvent {
  return n.kind === "drum";
}

export function isRestEvent(n: NoteEvent): n is RestEvent {
  return n.kind === "rest" || (n as any).isRest === true;
}

export function isMelodicNote(n: NoteEvent): n is MelodicNoteEvent {
  return !n.kind || n.kind === "melodic";
}

export interface ScoreState {
  title: string;
  artist: string;
  bpm: number;
  timeSignature: string;
  notes: NoteEvent[];
}

export interface NotationColors {
  noteColor: string;
  activeColor: string;
  staffColor: string;
  restColor: string;
  beamColor: string;
}

export const NOTATION_PRESETS: Record<string, { name: string; colors: NotationColors }> = {
  orange: {
    name: "Classic Orange",
    colors: { noteColor: "#fb923c", activeColor: "#FF6600", staffColor: "#e2e8f0", restColor: "#94a3b8", beamColor: "#fb923c" },
  },
  blue: {
    name: "Ocean Blue",
    colors: { noteColor: "#60a5fa", activeColor: "#3b82f6", staffColor: "#cbd5e1", restColor: "#94a3b8", beamColor: "#60a5fa" },
  },
  green: {
    name: "Forest Green",
    colors: { noteColor: "#4ade80", activeColor: "#22c55e", staffColor: "#d1d5db", restColor: "#9ca3af", beamColor: "#4ade80" },
  },
  purple: {
    name: "Royal Purple",
    colors: { noteColor: "#c084fc", activeColor: "#a855f7", staffColor: "#d4d4d8", restColor: "#a1a1aa", beamColor: "#c084fc" },
  },
  rose: {
    name: "Rose Pink",
    colors: { noteColor: "#fb7185", activeColor: "#f43f5e", staffColor: "#e2e8f0", restColor: "#94a3b8", beamColor: "#fb7185" },
  },
  mono: {
    name: "Monochrome",
    colors: { noteColor: "#d4d4d8", activeColor: "#ffffff", staffColor: "#a1a1aa", restColor: "#71717a", beamColor: "#d4d4d8" },
  },
};

export const DEFAULT_NOTATION_COLORS = NOTATION_PRESETS.orange.colors;

let _noteIdCounter = 0;
export function generateNoteId(): string {
  return `note_${Date.now()}_${_noteIdCounter++}`;
}

export function ensureNoteIds(notes: NoteEvent[]): NoteEvent[] {
  return notes.map(n => n.id ? n : { ...n, id: generateNoteId() });
}
