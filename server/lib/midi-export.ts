import type { NoteEvent } from "@shared/schema";

function writeVarLen(value: number): number[] {
  const bytes: number[] = [];
  let v = value;
  bytes.push(v & 0x7f);
  while ((v >>= 7) > 0) {
    bytes.push((v & 0x7f) | 0x80);
  }
  return bytes.reverse();
}

function writeInt16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function writeInt32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function generateMidi(notes: NoteEvent[], bpm: number): Buffer {
  const ticksPerBeat = 480;
  const microsecondsPerBeat = Math.round(60000000 / bpm);

  const sorted = [...notes].sort((a, b) => a.time - b.time);

  const trackData: number[] = [];

  // Tempo meta event
  trackData.push(0x00); // delta time
  trackData.push(0xff, 0x51, 0x03);
  trackData.push((microsecondsPerBeat >> 16) & 0xff);
  trackData.push((microsecondsPerBeat >> 8) & 0xff);
  trackData.push(microsecondsPerBeat & 0xff);

  // Track name
  const trackName = "Baseline Melody";
  trackData.push(0x00);
  trackData.push(0xff, 0x03, trackName.length);
  for (const c of trackName) {
    trackData.push(c.charCodeAt(0));
  }

  // Convert NoteEvents to MIDI events
  interface MidiEvent {
    tick: number;
    type: "on" | "off";
    midi: number;
    velocity: number;
  }

  const events: MidiEvent[] = [];
  const beatDuration = 60 / bpm;

  for (const note of sorted) {
    const startTick = Math.round((note.time / beatDuration) * ticksPerBeat);
    const durTicks = Math.max(1, Math.round((note.duration / beatDuration) * ticksPerBeat));
    const vel = Math.round(Math.min(127, Math.max(1, note.velocity * 127)));

    events.push({ tick: startTick, type: "on", midi: note.midi, velocity: vel });
    events.push({ tick: startTick + durTicks, type: "off", midi: note.midi, velocity: 0 });
  }

  events.sort((a, b) => a.tick - b.tick || (a.type === "off" ? -1 : 1));

  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;

    trackData.push(...writeVarLen(delta));
    const status = ev.type === "on" ? 0x90 : 0x80;
    trackData.push(status, ev.midi, ev.velocity);
  }

  // End of track
  trackData.push(0x00, 0xff, 0x2f, 0x00);

  // Build the full MIDI file
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    ...writeInt32(6),
    ...writeInt16(0), // format 0
    ...writeInt16(1), // 1 track
    ...writeInt16(ticksPerBeat),
  ];

  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    ...writeInt32(trackData.length),
  ];

  return Buffer.from([...header, ...trackHeader, ...trackData]);
}
