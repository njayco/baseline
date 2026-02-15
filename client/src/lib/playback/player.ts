import * as Tone from "tone";
import { type NoteEvent, isDrumNote, isRestEvent, isMelodicNote } from "@/lib/types";

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
  private melodicSynth: Tone.PolySynth | null = null;
  private kickSynth: Tone.MembraneSynth | null = null;
  private snareSynth: Tone.NoiseSynth | null = null;
  private hatSynth: Tone.NoiseSynth | null = null;
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

  private ensureMelodicSynth(): Tone.PolySynth {
    if (!this.melodicSynth) {
      this.melodicSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.3 },
      }).toDestination();
      this.melodicSynth.volume.value = -6;
    }
    return this.melodicSynth;
  }

  private ensureKickSynth(): Tone.MembraneSynth {
    if (!this.kickSynth) {
      this.kickSynth = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      }).toDestination();
      this.kickSynth.volume.value = -4;
    }
    return this.kickSynth;
  }

  private ensureSnareSynth(): Tone.NoiseSynth {
    if (!this.snareSynth) {
      this.snareSynth = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      }).toDestination();
      this.snareSynth.volume.value = -10;
    }
    return this.snareSynth;
  }

  private ensureHatSynth(): Tone.NoiseSynth {
    if (!this.hatSynth) {
      const filter = new Tone.Filter(8000, "highpass").toDestination();
      this.hatSynth = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 },
      }).connect(filter);
      this.hatSynth.volume.value = -14;
    }
    return this.hatSynth;
  }

  private playDrumHit(drum: string, time: number, velocity: number) {
    switch (drum) {
      case "kick":
        this.ensureKickSynth().triggerAttackRelease("C1", "8n", time, velocity);
        break;
      case "snare":
      case "clap":
      case "rim":
        this.ensureSnareSynth().triggerAttackRelease("8n", time);
        break;
      case "closed_hat":
      case "open_hat":
        this.ensureHatSynth().triggerAttackRelease(drum === "open_hat" ? "4n" : "16n", time);
        break;
      case "tom_low":
        this.ensureKickSynth().triggerAttackRelease("G1", "8n", time, velocity);
        break;
      case "tom_mid":
        this.ensureKickSynth().triggerAttackRelease("C2", "8n", time, velocity);
        break;
      case "tom_high":
        this.ensureKickSynth().triggerAttackRelease("E2", "8n", time, velocity);
        break;
      default:
        this.ensureSnareSynth().triggerAttackRelease("16n", time);
        break;
    }
  }

  async play(notes: NoteEvent[], fromTime: number = 0) {
    if (this.state === "playing") return;

    await Tone.start();

    this.notes = notes;
    const playableNotes = notes.filter(n => !isRestEvent(n));
    const sorted = [...playableNotes].sort((a, b) => a.time - b.time);
    if (sorted.length === 0 && notes.length === 0) return;

    const allSorted = [...notes].sort((a, b) => a.time - b.time);
    const lastEvent = allSorted[allSorted.length - 1];
    this.totalDuration = lastEvent ? lastEvent.time + lastEvent.duration : 0;

    Tone.getTransport().cancel();
    this.scheduledEvents = [];

    const usedTimes = new Map<string, number>();

    for (const note of sorted) {
      let noteTime = note.time - fromTime;
      if (noteTime < 0) continue;

      const synthKey = isDrumNote(note) ? note.drum : "melodic";
      const timeKey = `${synthKey}_${noteTime.toFixed(6)}`;
      if (usedTimes.has(timeKey)) {
        noteTime += 0.001 * (usedTimes.get(timeKey)! + 1);
      }
      usedTimes.set(timeKey, (usedTimes.get(timeKey) || 0) + 1);

      if (noteTime < 0) noteTime = 0;

      if (isDrumNote(note)) {
        const eventId = Tone.getTransport().schedule((time) => {
          this.playDrumHit(note.drum, time, note.velocity * 0.8);
        }, noteTime);
        this.scheduledEvents.push(eventId);
      } else if (isMelodicNote(note)) {
        const synth = this.ensureMelodicSynth();
        const eventId = Tone.getTransport().schedule((time) => {
          const noteName = MIDI_TO_NOTE[note.midi] || "C4";
          synth.triggerAttackRelease(noteName, note.duration, time, note.velocity * 0.8);
        }, noteTime);
        this.scheduledEvents.push(eventId);
      }
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
      if (isRestEvent(note)) continue;
      if (currentTime >= note.time && currentTime < note.time + note.duration) {
        active.add(note.id);
      }
    }
    return active;
  }

  dispose() {
    this.stop();
    if (this.melodicSynth) { this.melodicSynth.dispose(); this.melodicSynth = null; }
    if (this.kickSynth) { this.kickSynth.dispose(); this.kickSynth = null; }
    if (this.snareSynth) { this.snareSynth.dispose(); this.snareSynth = null; }
    if (this.hatSynth) { this.hatSynth.dispose(); this.hatSynth = null; }
  }
}

export const playbackEngine = new PlaybackEngine();
