import React, { useEffect, useRef } from "react";
import { Renderer, Stave, StaveNote, Beam, Formatter } from "vexflow";
import { type NoteEvent } from "@/lib/types";

interface StaffProps {
  notes: NoteEvent[];
  mode: "mobile" | "desktop";
  width?: number;
  activeNoteIds?: Set<string>;
}

export function Staff({ notes, mode, width = 400, activeNoteIds }: StaffProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const notesPerMeasure = 4;
    const measureCount = Math.ceil(notes.length / notesPerMeasure) || 1;
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
    context.setFillStyle("#e2e8f0");
    context.setStrokeStyle("#e2e8f0");

    for (let m = 0; m < measureCount; m++) {
      const lineIndex = Math.floor(m / measuresPerLine);
      const posInLine = m % measuresPerLine;

      const x = 10 + posInLine * measureWidth;
      const y = topPadding + lineIndex * lineHeight;

      const stave = new Stave(x, y, measureWidth);

      if (posInLine === 0 && (m === 0 || mode === "desktop")) {
        stave.addClef("treble");
      }
      if (m === 0) {
        stave.addTimeSignature("4/4");
      }

      stave.setContext(context).draw();

      const measureNotesData = notes.slice(m * notesPerMeasure, (m + 1) * notesPerMeasure);

      if (measureNotesData.length > 0) {
        const staveNotes = measureNotesData.map(n => {
          const noteName = midiToNoteName(n.midi);
          const duration = "q";
          const isActive = activeNoteIds && n.id && activeNoteIds.has(n.id);

          const staveNote = new StaveNote({ keys: [noteName], duration: duration });

          if (isActive) {
            staveNote.setStyle({ fillStyle: "#FF6600", strokeStyle: "#FF6600" });
          } else {
            staveNote.setStyle({ fillStyle: "#fb923c", strokeStyle: "#fb923c" });
          }

          return staveNote;
        });

        const beams = Beam.generateBeams(staveNotes);
        Formatter.FormatAndDraw(context, stave, staveNotes);
        beams.forEach((beam: any) => {
          beam.setStyle({ fillStyle: "#fb923c", strokeStyle: "#fb923c" });
          beam.setContext(context).draw();
        });
      }
    }

  }, [notes, mode, width, activeNoteIds]);

  return <div ref={containerRef} data-testid="staff-container" />;
}

function midiToNoteName(midi: number): string {
  const noteNames = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  const note = noteNames[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}/${octave}`;
}
