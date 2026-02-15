import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Mic, ArrowLeft, Settings2, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Staff } from "@/components/Staff";
import { InstrumentSelector } from "@/components/InstrumentSelector";
import { TransportControls } from "@/components/TransportControls";
import { audioEngine, type Instrument } from "@/lib/audio-engine";
import type { NoteEvent } from "@/lib/types";
import { ensureNoteIds } from "@/lib/types";
import { playbackEngine } from "@/lib/playback/player";
import { ExportPanel } from "@/components/ExportPanel";
import { NotationColorPicker } from "@/components/NotationColorPicker";
import { useToast } from "@/hooks/use-toast";
import { type NotationColors, DEFAULT_NOTATION_COLORS } from "@/lib/types";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Mobile() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument>("beatbox");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [scoreTitle, setScoreTitle] = useState("My Melody");
  const [artistName, setArtistName] = useState("Artist");
  const [scoreId, setScoreId] = useState<number | null>(null);
  const [bpm, setBpm] = useState(100);
  const [activeNoteIds, setActiveNoteIds] = useState<Set<string>>(new Set());
  const [staffWidth, setStaffWidth] = useState(360);
  const [colorPreset, setColorPreset] = useState("orange");
  const [notationColors, setNotationColors] = useState<NotationColors>(DEFAULT_NOTATION_COLORS);
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const updateWidth = () => setStaffWidth(window.innerWidth - 32);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    let interval: number;
    if (isRecording) {
      const startTime = Date.now() - elapsedTime * 1000;
      interval = window.setInterval(() => {
        setElapsedTime((Date.now() - startTime) / 1000);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    const cleanup = audioEngine.onNote((note) => {
      setNotes(prev => ensureNoteIds([...prev, note]));
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const unsub = playbackEngine.onTimeUpdate((time) => {
      const active = playbackEngine.getActiveNoteIds(notes, time);
      setActiveNoteIds(active);
    });
    return unsub;
  }, [notes]);

  useEffect(() => {
    if (scrollRef.current && notes.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes]);

  const toggleRecording = async () => {
    if (isRecording) {
      const audioBlob = await audioEngine.stopRecording();
      setIsRecording(false);

      if (audioBlob && audioBlob.size > 0) {
        setLastAudioBlob(audioBlob);
        setIsTranscribing(true);
        toast({ title: "Processing your melody..." });

        const result = await audioEngine.transcribe(audioBlob, selectedInstrument, bpm);
        setIsTranscribing(false);

        if (result && result.notes.length > 0) {
          if (result.bpm) setBpm(result.bpm);
          toast({ title: `Detected ${result.notes.length} notes!` });
          const merged = ensureNoteIds([...notes, ...result.notes]);
          setNotes(merged);
          await saveScore(merged);
        } else {
          toast({ title: "No notes detected", description: "Try singing or humming louder", variant: "destructive" });
        }
      }
    } else {
      playbackEngine.stop();
      const started = await audioEngine.startRecording();
      if (started) {
        setIsRecording(true);
      } else {
        toast({ title: "Microphone access needed", description: "Please allow microphone access to record", variant: "destructive" });
      }
    }
  };

  const saveScore = async (currentNotes: NoteEvent[]): Promise<number | null> => {
    try {
      if (scoreId) {
        await fetch(`/api/scores/${scoreId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: currentNotes, title: scoreTitle, artist: artistName, bpm, instrument: selectedInstrument }),
        });
        return scoreId;
      } else {
        const res = await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: currentNotes, title: scoreTitle, artist: artistName, bpm, instrument: selectedInstrument }),
        });
        const score = await res.json();
        setScoreId(score.id);
        return score.id;
      }
    } catch (err) {
      console.error("Save failed:", err);
      return null;
    }
  };

  const clearSession = () => {
    setIsRecording(false);
    audioEngine.stopRecording();
    playbackEngine.stop();
    setNotes([]);
    setElapsedTime(0);
    setScoreId(null);
    setActiveNoteIds(new Set());
    setLastAudioBlob(null);
  };

  return (
    <div className="h-screen bg-background flex flex-col font-sans overflow-hidden">
      <header className="flex items-center justify-between p-4 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50 shrink-0">
        <Link href="/">
          <Button variant="ghost" size="icon" className="-ml-2 text-muted-foreground" data-testid="button-back">
            <ArrowLeft className="h-6 w-6" />
          </Button>
        </Link>
        <div className="flex flex-col items-center">
          <h1 className="font-display text-xl tracking-wide text-primary text-glow">BASELINE</h1>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {elapsedTime.toFixed(2)}s
          </span>
        </div>
        
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2 text-muted-foreground" data-testid="button-settings">
              <Settings2 className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="top" className="bg-card border-b-border text-foreground">
            <SheetHeader>
              <SheetTitle className="text-primary font-display">Score Details</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="mobile-title">Title of Melody</Label>
                <Input 
                  id="mobile-title" 
                  value={scoreTitle} 
                  onChange={(e) => setScoreTitle(e.target.value)} 
                  className="bg-background border-border"
                  data-testid="input-score-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile-artist">Artist Name</Label>
                <Input 
                  id="mobile-artist" 
                  value={artistName} 
                  onChange={(e) => setArtistName(e.target.value)}
                  className="bg-background border-border"
                  data-testid="input-artist-name"
                />
              </div>
              <div className="space-y-2 pt-2 border-t border-border/30">
                <Label data-testid="label-notation-colors">Notation Colors</Label>
                <NotationColorPicker
                  value={colorPreset}
                  onChange={(key, colors) => { setColorPreset(key); setNotationColors(colors); }}
                  variant="horizontal"
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 bg-grid-pattern relative"
      >
        <div className="text-center mb-2">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-2">
            <span className="text-[10px] text-primary font-semibold uppercase tracking-wider" data-testid="badge-beatbox-mode">Beatbox Mode</span>
          </div>
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.3em] mb-1" data-testid="label-generated-sheet">Generated Sheet Music</p>
          <h3 className="text-lg font-bold text-foreground" data-testid="text-score-title">{scoreTitle}</h3>
          <p className="text-xs text-muted-foreground" data-testid="text-artist-name">{artistName}</p>
        </div>

        {isTranscribing ? (
          <div className="text-center text-primary animate-pulse py-12">
            <Loader2 className="h-12 w-12 mx-auto animate-spin mb-4" />
            <p className="font-display text-xl">TRANSCRIBING...</p>
            <p className="text-sm text-muted-foreground">AI is converting your audio to notes</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center text-muted-foreground/30 animate-pulse py-12">
            <p className="font-display text-2xl">TAP RECORD</p>
            <p className="text-sm">Make some beats!</p>
          </div>
        ) : (
          <div className="w-full">
            <Staff notes={notes} mode="mobile" width={staffWidth} activeNoteIds={activeNoteIds} instrument={selectedInstrument} colors={notationColors} />
          </div>
        )}
         
        {isRecording && (
          <div className="h-16 bg-gradient-to-t from-primary/10 to-transparent flex items-end justify-center gap-1 pb-2 mt-4">
            {[...Array(20)].map((_, i) => (
              <div 
                key={i} 
                className="w-1 bg-primary/50 rounded-full animate-pulse"
                style={{ 
                  height: `${Math.random() * 100}%`,
                  animationDuration: `${0.2 + Math.random() * 0.5}s`
                }} 
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border-t border-border/50 pb-6 pt-4 rounded-t-3xl shadow-2xl relative z-20 shrink-0">
          <div className="px-4 space-y-3">
            <div className="flex justify-center">
              <div className="flex items-center gap-4">
                <Button 
                  size="lg"
                  className={cn(
                    "h-16 w-16 rounded-full border-4 border-background shadow-xl transition-all duration-300 flex items-center justify-center",
                    isRecording 
                      ? "bg-destructive text-destructive-foreground animate-pulse hover:bg-destructive/90" 
                      : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105"
                  )}
                  onClick={toggleRecording}
                  disabled={isTranscribing}
                  data-testid="button-record-main"
                >
                   {isTranscribing ? <Loader2 className="h-8 w-8 animate-spin" /> : isRecording ? <div className="h-6 w-6 bg-current rounded-sm" /> : <Mic className="h-8 w-8" />}
                </Button>
              </div>
            </div>

            <TransportControls notes={notes} onClear={clearSession} variant="full" />

            <div className="flex justify-between items-center px-4">
               <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setNotes(n => n.slice(0, -1))} data-testid="button-undo">
                 <Undo2 className="h-4 w-4 mr-2" /> Undo
               </Button>
               <Button variant="ghost" size="sm" className="text-destructive" onClick={clearSession} data-testid="button-clear">
                 Clear
               </Button>
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-lg p-2 text-center">
              <p className="text-[10px] text-primary/70 font-semibold uppercase tracking-wider mb-1">Beatbox Tips</p>
              <div className="flex justify-center gap-3 text-[9px] text-muted-foreground/60">
                <span>Quiet room</span>
                <span>|</span>
                <span>Gaps for rests</span>
                <span>|</span>
                <span>1 hit = 1 note</span>
              </div>
            </div>

            <div className="bg-background/50 rounded-xl p-2">
               <p className="text-xs text-center text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Select Input</p>
               <InstrumentSelector 
                 value={selectedInstrument} 
                 onChange={(v) => setSelectedInstrument(v as Instrument)} 
                 className="grid-cols-3 gap-1 p-0"
               />
            </div>
          </div>

          <ExportPanel notes={notes} scoreId={scoreId} onSaveScore={saveScore} variant="mobile" scoreTitle={scoreTitle} artistName={artistName} audioBlob={lastAudioBlob} />
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
