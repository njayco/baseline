import React, { useEffect, useRef } from "react";
import { Renderer, Stave, StaveNote, Beam, Formatter } from "vexflow";
import { type NoteEvent, isDrumNote, isRestEvent, isMelodicNote, type NotationColors, DEFAULT_NOTATION_COLORS } from "@/lib/types";

interface StaffProps {
  notes: NoteEvent[];
  mode: "mobile" | "desktop";
  width?: number;
  activeNoteIds?: Set<string>;
  instrument?: string;
  colors?: NotationColors;
}

const DRUM_STAFF_MAP: Record<string, { key: string; notehead?: string }> = {
  kick:       { key: "d/4" },
  snare:      { key: "c/5" },
  closed_hat: { key: "g/5", notehead: "x2" },
  open_hat:   { key: "g/5", notehead: "x2" },
  clap:       { key: "c/5", notehead: "x2" },
  tom_low:    { key: "e/4" },
  tom_mid:    { key: "a/4" },
  tom_high:   { key: "b/4" },
  rim:        { key: "c/5", notehead: "x2" },
  perc:       { key: "c/5" },
};

function getDrumKey(drum: string): string {
  return DRUM_STAFF_MAP[drum]?.key || "c/5";
}

function getDrumNotehead(drum: string): string | undefined {
  return DRUM_STAFF_MAP[drum]?.notehead;
}

function noteDurationFromSeconds(durSec: number, bpm: number = 120): string {
  const beatSec = 60 / bpm;
  const beats = durSec / beatSec;

  if (beats >= 3.5) return "w";
  if (beats >= 1.5) return "h";
  if (beats >= 0.75) return "q";
  if (beats >= 0.375) return "8";
  return "16";
}

export function Staff({ notes, mode, width = 400, activeNoteIds, instrument, colors }: StaffProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const c = colors || DEFAULT_NOTATION_COLORS;

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const isBeatbox = instrument === "beatbox";
    const allEvents = notes;

    const notesPerMeasure = 4;
    const measureCount = Math.ceil(allEvents.length / notesPerMeasure) || 1;
    const measureWidth = mode === "mobile" ? Math.min(width - 20, 320) : 250;
    const measuresPerLine = Math.max(1, Math.floor((width - 20) / measureWidth));

    const lineCount = Math.ceil(measureCount / measuresPerLine);
    const lineHeight = 120;
    const topPadding = 20;
    const totalHeight = topPadding + lineCount * lineHeight + 40;

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    renderer.resize(width, totalHeight);
    const context = renderer.getContext();

    context.setFont("Arial", 10);
    context.setFillStyle(c.staffColor);
    context.setStrokeStyle(c.staffColor);

    for (let m = 0; m < measureCount; m++) {
      const lineIndex = Math.floor(m / measuresPerLine);
      const posInLine = m % measuresPerLine;

      const x = 10 + posInLine * measureWidth;
      const y = topPadding + lineIndex * lineHeight;

      const stave = new Stave(x, y, measureWidth);

      if (posInLine === 0 && (m === 0 || mode === "desktop")) {
        stave.addClef(isBeatbox ? "percussion" : "treble");
      }
      if (m === 0) {
        stave.addTimeSignature("4/4");
      }

      stave.setContext(context).draw();

      const measureEvents = allEvents.slice(m * notesPerMeasure, (m + 1) * notesPerMeasure);

      if (measureEvents.length > 0) {
        const staveNotes = measureEvents.map(n => {
          const isActive = activeNoteIds && n.id && activeNoteIds.has(n.id);

          if (isRestEvent(n)) {
            const dur = noteDurationFromSeconds(n.duration);
            const restNote = new StaveNote({ keys: ["b/4"], duration: dur + "r" });
            restNote.setStyle({ fillStyle: c.restColor, strokeStyle: c.restColor });
            return restNote;
          }

          if (isDrumNote(n)) {
            const key = getDrumKey(n.drum);
            const notehead = getDrumNotehead(n.drum);
            const dur = noteDurationFromSeconds(n.duration);

            const noteConfig: any = { keys: [key], duration: dur };
            const staveNote = new StaveNote(noteConfig);
            const color = isActive ? c.activeColor : c.noteColor;

            if (notehead === "x2") {
              try {
                staveNote.setKeyStyle(0, { fillStyle: color, strokeStyle: color });
                const stem = (staveNote as any).getStem?.();
                if (stem) {
                  stem.setStyle({ strokeStyle: color });
                }
              } catch (e) {}
            }

            staveNote.setStyle({ fillStyle: color, strokeStyle: color });
            return staveNote;
          }

          if (isMelodicNote(n)) {
            const noteName = midiToNoteName(n.midi);
            const staveNote = new StaveNote({ keys: [noteName], duration: "q" });
            const color = isActive ? c.activeColor : c.noteColor;
            staveNote.setStyle({ fillStyle: color, strokeStyle: color });
            return staveNote;
          }

          return new StaveNote({ keys: ["c/5"], duration: "q" });
        });

        const nonRestNotes = staveNotes.filter((_, i) => !isRestEvent(measureEvents[i]));
        let beams: any[] = [];
        if (nonRestNotes.length >= 2) {
          try {
            beams = Beam.generateBeams(nonRestNotes);
          } catch (e) {}
        }

        Formatter.FormatAndDraw(context, stave, staveNotes);
        beams.forEach((beam: any) => {
          beam.setStyle({ fillStyle: c.beamColor, strokeStyle: c.beamColor });
          beam.setContext(context).draw();
        });
      }
    }

  }, [notes, mode, width, activeNoteIds, instrument, c]);

  return <div ref={containerRef} data-testid="staff-container" />;
}

function midiToNoteName(midi: number): string {
  const noteNames = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  const note = noteNames[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}/${octave}`;
}
