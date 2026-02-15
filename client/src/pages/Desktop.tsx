import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  ArrowLeft, Mic, Save, Download, Play, Pause, 
  Settings, Music, Clock, Sliders, Loader2, Undo2, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Staff } from "@/components/Staff";
import { audioEngine, type Instrument } from "@/lib/audio-engine";
import type { NoteEvent } from "@/lib/types";
import { InstrumentSelector } from "@/components/InstrumentSelector";
import { useToast } from "@/hooks/use-toast";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Desktop() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [bpm, setBpm] = useState([100]);
  const [quantize, setQuantize] = useState(true);
  const [scoreTitle, setScoreTitle] = useState("Untitled Score");
  const [artistName, setArtistName] = useState("Baseline User");
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument>("humming");
  const [scoreId, setScoreId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const cleanup = audioEngine.onNote((note) => {
      setNotes(prev => [...prev, note]);
      const scrollContainer = document.getElementById("score-container");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
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

        const result = await audioEngine.transcribe(audioBlob, selectedInstrument, bpm[0]);
        setIsTranscribing(false);

        if (result && result.notes.length > 0) {
          if (result.bpm) setBpm([result.bpm]);
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
        toast({ title: "Microphone access needed", description: "Please allow microphone access", variant: "destructive" });
      }
    }
  };

  const saveScore = async (currentNotes: NoteEvent[]) => {
    try {
      if (scoreId) {
        await fetch(`/api/scores/${scoreId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: currentNotes, title: scoreTitle, artist: artistName, bpm: bpm[0], instrument: selectedInstrument }),
        });
      } else {
        const res = await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: currentNotes, title: scoreTitle, artist: artistName, bpm: bpm[0], instrument: selectedInstrument }),
        });
        const score = await res.json();
        setScoreId(score.id);
      }
      toast({ title: "Score saved!" });
    } catch (err) {
      toast({ title: "Save failed", variant: "destructive" });
    }
  };

  const exportScore = async (format: "musicxml" | "midi") => {
    if (!scoreId) {
      await saveScore(notes);
    }
    const id = scoreId;
    if (!id) {
      toast({ title: "Please record some notes first", variant: "destructive" });
      return;
    }

    setIsExporting(true);
    try {
      const res = await fetch(`/api/scores/${id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Checkout failed");
      }
      
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      toast({ title: err.message || "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const clearSession = () => {
    setIsRecording(false);
    audioEngine.stopRecording();
    setNotes([]);
    setScoreId(null);
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground overflow-hidden">
      <aside className="w-80 border-r border-border bg-card flex flex-col z-20 shadow-xl">
        <div className="p-6 border-b border-border">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer group mb-6">
              <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <h1 className="font-display text-2xl tracking-wide text-primary text-glow">BASELINE</h1>
            </div>
          </Link>

          <div className="space-y-6">
             <div className="space-y-2">
               <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transport</label>
               <div className="flex gap-2">
                 <Button 
                   className={isRecording ? "bg-destructive hover:bg-destructive/90 w-full" : "w-full"} 
                   size="lg"
                   onClick={toggleRecording}
                   disabled={isTranscribing}
                   data-testid="button-record-desktop"
                 >
                   {isTranscribing ? (
                     <><Loader2 className="h-4 w-4 animate-spin mr-2" /> PROCESSING...</>
                   ) : isRecording ? "STOP RECORDING" : "RECORD"}
                 </Button>
               </div>
             </div>

             <div className="space-y-4 pt-4 border-t border-border/50">
               <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Score Info</label>
               <div className="space-y-3">
                 <div className="space-y-1">
                   <Label htmlFor="score-title" className="text-xs">Title</Label>
                   <Input 
                     id="score-title" 
                     value={scoreTitle} 
                     onChange={(e) => setScoreTitle(e.target.value)}
                     className="h-8 bg-muted/50 border-border/50"
                     data-testid="input-score-title"
                   />
                 </div>
                 <div className="space-y-1">
                   <Label htmlFor="artist-name" className="text-xs">Artist</Label>
                   <Input 
                     id="artist-name" 
                     value={artistName} 
                     onChange={(e) => setArtistName(e.target.value)}
                     className="h-8 bg-muted/50 border-border/50"
                     data-testid="input-artist-name"
                   />
                 </div>
               </div>
             </div>

             <div className="space-y-4 pt-4 border-t border-border/50">
               <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input Source</label>
               <InstrumentSelector 
                  value={selectedInstrument} 
                  onChange={(v) => setSelectedInstrument(v as Instrument)} 
                  className="w-full"
                  variant="vertical"
               />
             </div>

             <div className="space-y-4 pt-4 border-t border-border/50">
               <div className="flex items-center justify-between">
                 <label className="text-sm font-medium">Quantization</label>
                 <Switch checked={quantize} onCheckedChange={setQuantize} />
               </div>
               
               <div className="space-y-2">
                 <div className="flex justify-between text-xs text-muted-foreground">
                   <span>BPM</span>
                   <span>{bpm[0]}</span>
                 </div>
                 <Slider value={bpm} onValueChange={setBpm} min={60} max={200} step={1} />
               </div>
             </div>
          </div>
        </div>
        
        <div className="mt-auto p-6 border-t border-border bg-muted/20 space-y-2">
           <Button 
             variant="outline" 
             className="w-full gap-2" 
             onClick={() => exportScore("musicxml")}
             disabled={isExporting || notes.length === 0}
             data-testid="button-export-musicxml"
           >
             <Download className="h-4 w-4" /> Export MusicXML <span className="text-xs text-muted-foreground ml-auto">$0.99</span>
           </Button>
           <Button 
             variant="outline" 
             className="w-full gap-2" 
             onClick={() => exportScore("midi")}
             disabled={isExporting || notes.length === 0}
             data-testid="button-export-midi"
           >
             <Music className="h-4 w-4" /> Export MIDI <span className="text-xs text-muted-foreground ml-auto">$1.99</span>
           </Button>
           <Button 
             variant="ghost" 
             className="w-full gap-2 text-muted-foreground" 
             onClick={() => saveScore(notes)}
             disabled={notes.length === 0}
             data-testid="button-save"
           >
             <Save className="h-4 w-4" /> Save Score
           </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-muted/5 relative">
        <div className="h-16 border-b border-border bg-background/50 backdrop-blur flex items-center px-6 justify-between">
           <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNotes(n => n.slice(0, -1))} data-testid="button-undo">
                <Undo2 className="h-4 w-4 mr-2"/> Undo
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSession} data-testid="button-clear">
                <Trash2 className="h-4 w-4 mr-2"/> Clear
              </Button>
           </div>
           <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
             <span>4/4</span>
             <span>C Major</span>
             {isTranscribing && <span className="text-primary flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Transcribing...</span>}
           </div>
        </div>

        <div 
          id="score-container"
          className="flex-1 overflow-y-auto p-8 flex justify-center scroll-smooth"
        >
          <div className="w-[800px] min-h-[1000px] bg-[#fdfbf7] shadow-2xl rounded-sm p-12 relative transition-all duration-300">
             <div className="absolute inset-0 paper-texture opacity-40 pointer-events-none mix-blend-multiply" />
             
             <div className="relative z-10">
               <h2 className="text-center font-serif text-3xl text-black/80 mb-2" data-testid="text-score-title">{scoreTitle || "Untitled Score"}</h2>
               <p className="text-center font-sans text-xs text-black/40 mb-12 uppercase tracking-widest" data-testid="text-artist-name">
                 Transcribed by {artistName || "Baseline User"}
               </p>
               
               <div className="text-black">
                  <Staff notes={notes} mode="desktop" width={700} />
               </div>

               {notes.length === 0 && !isTranscribing && (
                 <div className="text-center text-black/20 mt-24">
                   <Music className="h-16 w-16 mx-auto mb-4" />
                   <p className="text-lg">Record a melody to see sheet music here</p>
                 </div>
               )}
             </div>
          </div>
        </div>
      </main>

      <aside className="w-16 border-l border-border bg-card flex flex-col items-center py-4 gap-4">
         <Button variant="ghost" size="icon" className="opacity-50 hover:opacity-100"><Settings className="h-5 w-5"/></Button>
         <Button variant="ghost" size="icon" className="opacity-50 hover:opacity-100"><Clock className="h-5 w-5"/></Button>
      </aside>
    </div>
  );
}
