import type { NoteEvent } from "@shared/schema";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNote(midi: number) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const step = name[0];
  const alter = name.includes("#") ? 1 : 0;
  return { step, alter, octave };
}

function durationToType(dur: number, bpm: number): { divisions: number; type: string } {
  const beatDuration = 60 / bpm;
  const beats = dur / beatDuration;

  if (beats >= 3.5) return { divisions: 4, type: "whole" };
  if (beats >= 1.5) return { divisions: 2, type: "half" };
  if (beats >= 0.75) return { divisions: 1, type: "quarter" };
  if (beats >= 0.375) return { divisions: 1, type: "eighth" };
  return { divisions: 1, type: "16th" };
}

export function generateMusicXML(
  notes: NoteEvent[],
  title: string,
  artist: string,
  bpm: number,
  timeSignature: string
): string {
  const [beats, beatType] = timeSignature.split("/").map(Number);
  const divisionsPerQuarter = 1;

  let measures = "";
  let currentMeasureNotes: NoteEvent[] = [];
  let measureNumber = 1;

  const sorted = [...notes].sort((a, b) => a.time - b.time);

  const notesPerMeasure = beats;
  for (let i = 0; i < sorted.length; i += notesPerMeasure) {
    currentMeasureNotes = sorted.slice(i, i + notesPerMeasure);

    let notesXml = "";
    for (const n of currentMeasureNotes) {
      const { step, alter, octave } = midiToNote(n.midi);
      const { divisions, type } = durationToType(n.duration, bpm);

      notesXml += `
      <note>
        <pitch>
          <step>${step}</step>${alter ? `\n          <alter>${alter}</alter>` : ""}
          <octave>${octave}</octave>
        </pitch>
        <duration>${divisions}</duration>
        <type>${type}</type>
      </note>`;
    }

    const attrs = measureNumber === 1 ? `
      <attributes>
        <divisions>${divisionsPerQuarter}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type>
      </direction>` : "";

    measures += `
    <measure number="${measureNumber}">${attrs}${notesXml}
    </measure>`;
    measureNumber++;
  }

  if (sorted.length === 0) {
    measures = `
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>4</duration><type>whole</type></note>
    </measure>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <identification>
    <creator type="composer">${escapeXml(artist)}</creator>
    <encoding><software>Baseline</software></encoding>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
  </part-list>
  <part id="P1">${measures}
  </part>
</score-partwise>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
