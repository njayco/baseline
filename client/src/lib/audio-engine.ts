import { type NoteEvent, generateNoteId } from "@/lib/types";

export type Instrument = "beatbox" | "humming" | "whistle" | "piano" | "drums";

type NoteCallback = (note: NoteEvent) => void;
type TranscriptionCallback = (result: TranscriptionResult) => void;

export interface TranscriptionResult {
  bpm: number;
  timeSignature: string;
  notes: NoteEvent[];
  final: boolean;
}

export class AudioEngine {
  private isRecording = false;
  private listeners: NoteCallback[] = [];
  private transcriptionListeners: TranscriptionCallback[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor() {}

  async startRecording(): Promise<boolean> {
    if (this.isRecording) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250);
      this.isRecording = true;
      return true;
    } catch (err) {
      console.error("Microphone access denied:", err);
      return false;
    }
  }

  stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        this.audioChunks = [];
        this.isRecording = false;
        
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
        
        resolve(blob);
      };
      
      this.mediaRecorder.stop();
    });
  }

  async transcribe(audioBlob: Blob, instrument: Instrument = "beatbox", bpm: number = 120): Promise<TranscriptionResult | null> {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const response = await fetch("/api/transcribe-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, instrument, bpm }),
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result: TranscriptionResult = await response.json();

      result.notes.forEach(note => {
        if (!note.id) note.id = generateNoteId();
        note.instrument = instrument;
        this.notifyListeners(note);
      });

      this.transcriptionListeners.forEach(cb => cb(result));

      return result;
    } catch (err) {
      console.error("Transcription error:", err);
      return null;
    }
  }

  get recording() {
    return this.isRecording;
  }

  onNote(callback: NoteCallback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  onTranscription(callback: TranscriptionCallback) {
    this.transcriptionListeners.push(callback);
    return () => {
      this.transcriptionListeners = this.transcriptionListeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(note: NoteEvent) {
    this.listeners.forEach(cb => cb(note));
  }
}

export const audioEngine = new AudioEngine();
