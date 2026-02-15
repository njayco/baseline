export interface NoteEvent {
  id: string;        // unique stable ID for highlighting
  time: number;      // seconds from start
  duration: number;  // seconds
  midi: number;      // MIDI pitch (60 = C4)
  velocity: number;  // 0-1
  confidence: number;// 0-1
  instrument: string;
}

export interface ScoreState {
  title: string;
  artist: string;
  bpm: number;
  timeSignature: string;
  notes: NoteEvent[];
}

let _noteIdCounter = 0;
export function generateNoteId(): string {
  return `note_${Date.now()}_${_noteIdCounter++}`;
}

export function ensureNoteIds(notes: NoteEvent[]): NoteEvent[] {
  return notes.map(n => n.id ? n : { ...n, id: generateNoteId() });
}
