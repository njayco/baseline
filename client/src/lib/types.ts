export interface NoteEvent {
  time: number;      // seconds from start
  duration: number;  // seconds
  midi: number;      // MIDI pitch (60 = C4)
  velocity: number;  // 0-1
  confidence: number;// 0-1
  instrument: string;
}

export interface ScoreState {
  bpm: number;
  timeSignature: string;
  notes: NoteEvent[];
}
