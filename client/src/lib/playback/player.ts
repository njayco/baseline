import * as Tone from "tone";
import { type NoteEvent } from "@/lib/types";

export type PlaybackState = "stopped" | "playing" | "paused";

type TimeUpdateCallback = (currentTimeSec: number) => void;
type StateChangeCallback = (state: PlaybackState) => void;

const MIDI_TO_NOTE: Record<number, string> = {};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
for (let midi = 0; midi < 128; midi++) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  MIDI_TO_NOTE[midi] = `${name}${octave}`;
}

class PlaybackEngine {
  private state: PlaybackState = "stopped";
  private timeUpdateCallbacks: TimeUpdateCallback[] = [];
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private synth: Tone.PolySynth | null = null;
  private scheduledEvents: number[] = [];
  private startTime = 0;
  private pausedAt = 0;
  private totalDuration = 0;
  private animFrameId: number | null = null;
  private notes: NoteEvent[] = [];

  getState(): PlaybackState {
    return this.state;
  }

  onTimeUpdate(cb: TimeUpdateCallback): () => void {
    this.timeUpdateCallbacks.push(cb);
    return () => {
      this.timeUpdateCallbacks = this.timeUpdateCallbacks.filter(c => c !== cb);
    };
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.stateChangeCallbacks.push(cb);
    return () => {
      this.stateChangeCallbacks = this.stateChangeCallbacks.filter(c => c !== cb);
    };
  }

  private emitTimeUpdate(time: number) {
    this.timeUpdateCallbacks.forEach(cb => cb(time));
  }

  private emitStateChange(state: PlaybackState) {
    this.stateChangeCallbacks.forEach(cb => cb(state));
  }

  private ensureSynth(): Tone.PolySynth {
    if (!this.synth) {
      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.3 },
      }).toDestination();
      this.synth.volume.value = -6;
    }
    return this.synth;
  }

  async play(notes: NoteEvent[], fromTime: number = 0) {
    if (this.state === "playing") return;

    await Tone.start();
    const synth = this.ensureSynth();

    this.notes = notes;
    const sorted = [...notes].sort((a, b) => a.time - b.time);
    if (sorted.length === 0) return;

    const lastNote = sorted[sorted.length - 1];
    this.totalDuration = lastNote.time + lastNote.duration;

    Tone.getTransport().cancel();
    this.scheduledEvents = [];

    for (const note of sorted) {
      const noteTime = note.time - fromTime;
      if (noteTime < 0) continue;

      const eventId = Tone.getTransport().schedule((time) => {
        const noteName = MIDI_TO_NOTE[note.midi] || "C4";
        synth.triggerAttackRelease(noteName, note.duration, time, note.velocity * 0.8);
      }, noteTime);
      this.scheduledEvents.push(eventId);
    }

    const endEventId = Tone.getTransport().schedule(() => {
      this.stop();
    }, this.totalDuration - fromTime + 0.1);
    this.scheduledEvents.push(endEventId);

    Tone.getTransport().start();
    this.startTime = Tone.now() - fromTime;
    this.state = "playing";
    this.emitStateChange("playing");
    this.startAnimationLoop();
  }

  pause() {
    if (this.state !== "playing") return;
    Tone.getTransport().pause();
    this.pausedAt = Tone.now() - this.startTime;
    this.state = "paused";
    this.emitStateChange("paused");
    this.stopAnimationLoop();
  }

  resume() {
    if (this.state !== "paused") return;
    this.play(this.notes, this.pausedAt);
  }

  stop() {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    this.scheduledEvents = [];
    this.state = "stopped";
    this.pausedAt = 0;
    this.emitStateChange("stopped");
    this.emitTimeUpdate(0);
    this.stopAnimationLoop();
  }

  replay(notes: NoteEvent[]) {
    this.stop();
    setTimeout(() => this.play(notes, 0), 50);
  }

  togglePlayPause(notes: NoteEvent[]) {
    if (this.state === "playing") {
      this.pause();
    } else if (this.state === "paused") {
      this.resume();
    } else {
      this.play(notes, 0);
    }
  }

  private startAnimationLoop() {
    const tick = () => {
      if (this.state !== "playing") return;
      const currentTime = Tone.now() - this.startTime;
      this.emitTimeUpdate(currentTime);
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopAnimationLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  getActiveNoteIds(notes: NoteEvent[], currentTime: number): Set<string> {
    const active = new Set<string>();
    for (const note of notes) {
      if (currentTime >= note.time && currentTime < note.time + note.duration) {
        active.add(note.id);
      }
    }
    return active;
  }

  dispose() {
    this.stop();
    if (this.synth) {
      this.synth.dispose();
      this.synth = null;
    }
  }
}

export const playbackEngine = new PlaybackEngine();
