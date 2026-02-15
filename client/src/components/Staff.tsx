import React, { useEffect, useRef } from "react";
import { Renderer, Stave, StaveNote, Beam, Formatter } from "vexflow";
import { type NoteEvent } from "@/lib/types";

interface StaffProps {
  notes: NoteEvent[];
  mode: "mobile" | "desktop";
  width?: number;
}

export function Staff({ notes, mode, width = 400 }: StaffProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous render
    containerRef.current.innerHTML = "";

    // Calculate dimensions
    const height = mode === "mobile" ? 150 : Math.max(200, Math.ceil(notes.length / 8) * 150 + 100);
    const renderWidth = mode === "mobile" ? width : width;

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
    renderer.resize(renderWidth, height);
    const context = renderer.getContext();

    // Style the staff for Dark Theme
    context.setFont("Arial", 10);
    context.setFillStyle("#e2e8f0"); // light text
    context.setStrokeStyle("#e2e8f0"); // light lines

    // Group notes into measures (simplification: 4 beats per measure)
    const notesPerMeasure = 4;
    const measureCount = Math.ceil(notes.length / notesPerMeasure) || 1;
    
    let currentMeasureX = 10;
    let currentMeasureY = 10;
    const measureWidth = mode === "mobile" ? (renderWidth - 20) / (mode === "mobile" ? 1 : 2) : 250;

    for (let m = 0; m < measureCount; m++) {
      let x = currentMeasureX;
      let y = currentMeasureY;

      if (mode === "desktop") {
        if (x + measureWidth > renderWidth) {
            x = 10;
            y += 120;
        }
        currentMeasureX = x + measureWidth;
        currentMeasureY = y;
      } else {
         if (m < measureCount - 2) continue; // Only show last 2 measures on mobile
         x = (m - (measureCount > 2 ? measureCount - 2 : 0)) * (measureWidth);
      }

      const stave = new Stave(x, y, measureWidth);

      // Add clef and time signature only to first measure
      if (m === 0 && (mode === "desktop" || measureCount <= 2)) {
        stave.addClef("treble").addTimeSignature("4/4");
      }
      
      // Customize stave color
      stave.setContext(context).draw();
      
      // Get notes for this measure
      const measureNotesData = notes.slice(m * notesPerMeasure, (m + 1) * notesPerMeasure);
      
      if (measureNotesData.length > 0) {
        const staveNotes = measureNotesData.map(n => {
           const noteName = midiToNoteName(n.midi);
           const duration = "q"; 
           
           return new StaveNote({ keys: [noteName], duration: duration })
             .setStyle({ fillStyle: "#fb923c", strokeStyle: "#fb923c" }); // Orange notes
        });

        const beams = Beam.generateBeams(staveNotes);
        Formatter.FormatAndDraw(context, stave, staveNotes);
        beams.forEach((beam: any) => {
           beam.setStyle({ fillStyle: "#fb923c", strokeStyle: "#fb923c" });
           beam.setContext(context).draw();
        });
      }
    }

  }, [notes, mode, width]);

  return <div ref={containerRef} className="overflow-hidden" />;
}

function midiToNoteName(midi: number): string {
  const noteNames = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  const note = noteNames[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}/${octave}`;
}
