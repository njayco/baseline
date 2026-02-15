import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Mic, ArrowLeft, Settings2, Share2, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Staff } from "@/components/Staff";
import { InstrumentSelector } from "@/components/InstrumentSelector";
import { audioEngine, type Instrument } from "@/lib/audio-engine";
import type { NoteEvent } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Mobile() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument>("humming");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [scoreTitle, setScoreTitle] = useState("My Melody");
  const [artistName, setArtistName] = useState("Artist");
  const [scoreId, setScoreId] = useState<number | null>(null);
  const [bpm, setBpm] = useState(100);
  const { toast } = useToast();

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
      setNotes(prev => [...prev, note]);
    });
    return cleanup;
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      const audioBlob = await audioEngine.stopRecording();
      setIsRecording(false);

      if (audioBlob && audioBlob.size > 0) {
        setIsTranscribing(true);
        toast({ title: "Processing your melody..." });

        const result = await audioEngine.transcribe(audioBlob, selectedInstrument, bpm);
        setIsTranscribing(false);

        if (result && result.notes.length > 0) {
          if (result.bpm) setBpm(result.bpm);
          toast({ title: `Detected ${result.notes.length} notes!` });
          await saveScore([...notes, ...result.notes]);
        } else {
          toast({ title: "No notes detected", description: "Try singing or humming louder", variant: "destructive" });
        }
      }
    } else {
      const started = await audioEngine.startRecording();
      if (started) {
        setIsRecording(true);
      } else {
        toast({ title: "Microphone access needed", description: "Please allow microphone access to record", variant: "destructive" });
      }
    }
  };

  const saveScore = async (currentNotes: NoteEvent[]) => {
    try {
      if (scoreId) {
        await fetch(`/api/scores/${scoreId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: currentNotes, title: scoreTitle, artist: artistName, bpm, instrument: selectedInstrument }),
        });
      } else {
        const res = await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: currentNotes, title: scoreTitle, artist: artistName, bpm, instrument: selectedInstrument }),
        });
        const score = await res.json();
        setScoreId(score.id);
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  const clearSession = () => {
    setIsRecording(false);
    audioEngine.stopRecording();
    setNotes([]);
    setElapsedTime(0);
    setScoreId(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="flex items-center justify-between p-4 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50">
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
                <Label htmlFor="mobile-title">Score Name</Label>
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
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4 bg-grid-pattern relative">
           <div className="absolute top-4 left-0 right-0 text-center opacity-50 z-10 pointer-events-none">
              <h3 className="text-lg font-bold text-foreground" data-testid="text-score-title">{scoreTitle}</h3>
              <p className="text-xs text-muted-foreground" data-testid="text-artist-name">{artistName}</p>
           </div>

           {isTranscribing ? (
             <div className="text-center text-primary animate-pulse">
               <Loader2 className="h-12 w-12 mx-auto animate-spin mb-4" />
               <p className="font-display text-xl">TRANSCRIBING...</p>
               <p className="text-sm text-muted-foreground">AI is converting your audio to notes</p>
             </div>
           ) : notes.length === 0 ? (
             <div className="text-center text-muted-foreground/30 animate-pulse">
               <p className="font-display text-2xl">TAP RECORD</p>
               <p className="text-sm">Sing or hum a melody</p>
             </div>
           ) : (
             <div className="w-full overflow-x-auto">
               <Staff notes={notes} mode="mobile" width={window.innerWidth - 32} />
             </div>
           )}
           
           {isRecording && (
             <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-primary/10 to-transparent flex items-end justify-center gap-1 pb-2">
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

        <div className="bg-card border-t border-border/50 pb-8 rounded-t-3xl shadow-2xl relative z-20">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2">
              <Button 
                size="lg"
                className={cn(
                  "h-20 w-20 rounded-full border-4 border-background shadow-xl transition-all duration-300 flex items-center justify-center",
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

            <div className="pt-14 px-4 space-y-4">
              <div className="flex justify-between items-center px-4">
                 <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setNotes(n => n.slice(0, -1))} data-testid="button-undo">
                   <Undo2 className="h-4 w-4 mr-2" /> Undo
                 </Button>
                 <Button variant="ghost" size="sm" className="text-destructive" onClick={clearSession} data-testid="button-clear">
                   Clear
                 </Button>
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
        </div>
      </main>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
