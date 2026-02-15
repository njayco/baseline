import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

export interface RawDrumEvent {
  type: "hit" | "rest";
  tMs: number;
  durMs: number;
  amp: number;
  features?: {
    centroid?: number;
    zcr?: number;
    bandEnergy?: { low: number; mid: number; high: number };
  };
}

export interface DrumTranscriberConfig {
  onsetThreshold: number;
  minInterOnsetMs: number;
  silenceRmsThreshold: number;
  restMinMs: number;
  bpm: number;
  subdivision: 8 | 16;
}

const DEFAULT_CONFIG: DrumTranscriberConfig = {
  onsetThreshold: 0.15,
  minInterOnsetMs: 100,
  silenceRmsThreshold: 0.02,
  restMinMs: 200,
  bpm: 120,
  subdivision: 8,
};

const DEBUG = process.env.DEBUG_DRUM_TRANSCRIBE === "true";

function debugLog(...args: any[]) {
  if (DEBUG) console.log("[drum-transcriber]", ...args);
}

export async function convertToAnalysisWav(inputBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `drum-in-${randomUUID()}`);
  const outputPath = join(tmpdir(), `drum-out-${randomUUID()}.wav`);

  try {
    await writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-vn",
        "-f", "wav",
        "-ar", "44100",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-y",
        outputPath,
      ]);
      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function parseWavSamples(wavBuffer: Buffer): { samples: Float32Array; sampleRate: number } {
  const riff = wavBuffer.toString("ascii", 0, 4);
  if (riff !== "RIFF") throw new Error("Not a valid WAV file");

  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let numChannels = 1;

  while (offset < wavBuffer.length - 8) {
    const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      numChannels = wavBuffer.readUInt16LE(offset + 10);
      sampleRate = wavBuffer.readUInt32LE(offset + 12);
      bitsPerSample = wavBuffer.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++;
  }

  if (dataOffset === -1) throw new Error("No data chunk found in WAV");

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataSize / bytesPerSample);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const byteOffset = dataOffset + i * bytesPerSample;
    if (byteOffset + bytesPerSample > wavBuffer.length) break;

    if (bitsPerSample === 16) {
      samples[i] = wavBuffer.readInt16LE(byteOffset) / 32768.0;
    } else if (bitsPerSample === 24) {
      const val = (wavBuffer[byteOffset] | (wavBuffer[byteOffset + 1] << 8) | (wavBuffer[byteOffset + 2] << 16));
      samples[i] = ((val > 0x7FFFFF ? val - 0x1000000 : val)) / 8388608.0;
    } else {
      samples[i] = wavBuffer.readInt16LE(byteOffset) / 32768.0;
    }
  }

  return { samples, sampleRate };
}

function computeEnergy(samples: Float32Array, frameSize: number, hopSize: number): Float32Array {
  const numFrames = Math.floor((samples.length - frameSize) / hopSize) + 1;
  const energy = new Float32Array(Math.max(numFrames, 0));

  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const start = i * hopSize;
    for (let j = 0; j < frameSize; j++) {
      const s = samples[start + j] || 0;
      sum += s * s;
    }
    energy[i] = Math.sqrt(sum / frameSize);
  }

  return energy;
}

function computeSpectralFlux(samples: Float32Array, frameSize: number, hopSize: number): Float32Array {
  const numFrames = Math.floor((samples.length - frameSize) / hopSize) + 1;
  const flux = new Float32Array(Math.max(numFrames, 0));

  let prevEnergy = new Float32Array(frameSize);

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    const currentEnergy = new Float32Array(frameSize);

    for (let j = 0; j < frameSize; j++) {
      const s = samples[start + j] || 0;
      currentEnergy[j] = s * s;
    }

    let diff = 0;
    for (let j = 0; j < frameSize; j++) {
      const d = currentEnergy[j] - prevEnergy[j];
      if (d > 0) diff += d;
    }
    flux[i] = diff;
    prevEnergy = currentEnergy;
  }

  return flux;
}

function smoothArray(arr: Float32Array, windowSize: number): Float32Array {
  const result = new Float32Array(arr.length);
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }
    result[i] = sum / count;
  }

  return result;
}

function computeBandEnergy(samples: Float32Array, start: number, length: number, sampleRate: number): { low: number; mid: number; high: number } {
  let low = 0, mid = 0, high = 0;
  let lowCount = 0, midCount = 0, highCount = 0;

  for (let i = 0; i < length && start + i < samples.length; i++) {
    const s = Math.abs(samples[start + i]);
    const idx = i;
    if (idx < length * 0.15) {
      low += s; lowCount++;
    } else if (idx < length * 0.5) {
      mid += s; midCount++;
    } else {
      high += s; highCount++;
    }
  }

  return {
    low: lowCount > 0 ? low / lowCount : 0,
    mid: midCount > 0 ? mid / midCount : 0,
    high: highCount > 0 ? high / highCount : 0,
  };
}

function computeZeroCrossingRate(samples: Float32Array, start: number, length: number): number {
  let crossings = 0;
  for (let i = 1; i < length && start + i < samples.length; i++) {
    if ((samples[start + i] >= 0) !== (samples[start + i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / Math.max(length - 1, 1);
}

interface OnsetInfo {
  frameIndex: number;
  timeMs: number;
  amplitude: number;
  features: {
    zcr: number;
    bandEnergy: { low: number; mid: number; high: number };
  };
}

function detectOnsets(
  samples: Float32Array,
  sampleRate: number,
  config: DrumTranscriberConfig
): OnsetInfo[] {
  const frameSize = 1024;
  const hopSize = 256;

  const energy = computeEnergy(samples, frameSize, hopSize);
  const flux = computeSpectralFlux(samples, frameSize, hopSize);
  const smoothedFlux = smoothArray(flux, 5);

  const maxFlux = Math.max(...Array.from(smoothedFlux), 0.001);
  const normalizedFlux = new Float32Array(smoothedFlux.length);
  for (let i = 0; i < smoothedFlux.length; i++) {
    normalizedFlux[i] = smoothedFlux[i] / maxFlux;
  }

  const msPerFrame = (hopSize / sampleRate) * 1000;
  const minFramesBetweenOnsets = Math.max(1, Math.floor(config.minInterOnsetMs / msPerFrame));

  const onsets: OnsetInfo[] = [];
  let lastOnsetFrame = -minFramesBetweenOnsets;

  for (let i = 1; i < normalizedFlux.length - 1; i++) {
    if (
      normalizedFlux[i] > config.onsetThreshold &&
      normalizedFlux[i] > normalizedFlux[i - 1] &&
      normalizedFlux[i] >= normalizedFlux[i + 1] &&
      (i - lastOnsetFrame) >= minFramesBetweenOnsets
    ) {
      const timeMs = (i * hopSize / sampleRate) * 1000;
      const sampleStart = i * hopSize;
      const featureWindow = Math.min(frameSize * 2, samples.length - sampleStart);

      let peakAmp = 0;
      for (let j = 0; j < featureWindow; j++) {
        peakAmp = Math.max(peakAmp, Math.abs(samples[sampleStart + j] || 0));
      }

      onsets.push({
        frameIndex: i,
        timeMs,
        amplitude: peakAmp,
        features: {
          zcr: computeZeroCrossingRate(samples, sampleStart, featureWindow),
          bandEnergy: computeBandEnergy(samples, sampleStart, featureWindow, sampleRate),
        },
      });

      lastOnsetFrame = i;
    }
  }

  debugLog(`Detected ${onsets.length} raw onsets`);
  return onsets;
}

function quantizeToGrid(timeMs: number, bpm: number, subdivision: 8 | 16): number {
  const beatMs = 60000 / bpm;
  const gridMs = beatMs / (subdivision / 4);
  return Math.round(timeMs / gridMs) * gridMs;
}

function durationToMs(beats: number, bpm: number): number {
  return (beats * 60000) / bpm;
}

export function transcribeWav(
  wavBuffer: Buffer,
  partialConfig: Partial<DrumTranscriberConfig> = {}
): { events: RawDrumEvent[]; stats: { detectedHitsCount: number; insertedRestsCount: number } } {
  const config = { ...DEFAULT_CONFIG, ...partialConfig };
  const { samples, sampleRate } = parseWavSamples(wavBuffer);

  debugLog(`WAV: ${samples.length} samples, ${sampleRate} Hz, duration: ${(samples.length / sampleRate).toFixed(2)}s`);

  const onsets = detectOnsets(samples, sampleRate, config);
  const audioDurationMs = (samples.length / sampleRate) * 1000;

  if (onsets.length === 0) {
    debugLog("No onsets detected, returning empty");
    return { events: [], stats: { detectedHitsCount: 0, insertedRestsCount: 0 } };
  }

  const beatMs = 60000 / config.bpm;
  const gridMs = beatMs / (config.subdivision / 4);
  const defaultHitDurMs = gridMs;

  const events: RawDrumEvent[] = [];
  let restsInserted = 0;

  for (let i = 0; i < onsets.length; i++) {
    const onset = onsets[i];
    const quantizedTime = quantizeToGrid(onset.timeMs, config.bpm, config.subdivision);

    if (i === 0 && quantizedTime > config.restMinMs) {
      const restDur = quantizedTime;
      events.push({
        type: "rest",
        tMs: 0,
        durMs: restDur,
        amp: 0,
      });
      restsInserted++;
    }

    events.push({
      type: "hit",
      tMs: quantizedTime,
      durMs: defaultHitDurMs,
      amp: onset.amplitude,
      features: {
        zcr: onset.features.zcr,
        bandEnergy: onset.features.bandEnergy,
      },
    });

    if (i < onsets.length - 1) {
      const nextQuantized = quantizeToGrid(onsets[i + 1].timeMs, config.bpm, config.subdivision);
      const gap = nextQuantized - (quantizedTime + defaultHitDurMs);

      if (gap >= config.restMinMs) {
        events.push({
          type: "rest",
          tMs: quantizedTime + defaultHitDurMs,
          durMs: gap,
          amp: 0,
        });
        restsInserted++;
      }
    } else {
      const remainingMs = audioDurationMs - (quantizedTime + defaultHitDurMs);
      if (remainingMs >= config.restMinMs) {
        events.push({
          type: "rest",
          tMs: quantizedTime + defaultHitDurMs,
          durMs: remainingMs,
          amp: 0,
        });
        restsInserted++;
      }
    }
  }

  debugLog(`Output: ${onsets.length} hits, ${restsInserted} rests, ${events.length} total events`);
  debugLog("Onset times (ms):", onsets.map(o => o.timeMs.toFixed(1)).join(", "));
  debugLog("Thresholds:", { onset: config.onsetThreshold, silence: config.silenceRmsThreshold, minGap: config.minInterOnsetMs });

  return {
    events,
    stats: {
      detectedHitsCount: onsets.length,
      insertedRestsCount: restsInserted,
    },
  };
}
