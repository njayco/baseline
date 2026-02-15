import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScoreSchema, noteEventSchema } from "@shared/schema";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client";
import { ensureCompatibleFormat } from "./replit_integrations/audio/client";
import { generateMusicXML } from "./lib/musicxml";
import { generateMidi } from "./lib/midi-export";
import { toFile } from "openai";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { transcribeWav, convertToAnalysisWav, type RawDrumEvent } from "./lib/drum-transcriber";

const DEBUG = process.env.DEBUG_DRUM_TRANSCRIBE === "true";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============== SCORES CRUD ==============

  app.get("/api/scores", async (_req, res) => {
    try {
      const scores = await storage.getAllScores();
      res.json(scores);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch scores" });
    }
  });

  app.get("/api/scores/:id", async (req, res) => {
    try {
      const score = await storage.getScore(Number(req.params.id));
      if (!score) return res.status(404).json({ error: "Score not found" });
      res.json(score);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch score" });
    }
  });

  app.post("/api/scores", async (req, res) => {
    try {
      const data = insertScoreSchema.parse(req.body);
      const score = await storage.createScore(data);
      res.status(201).json(score);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Invalid score data" });
    }
  });

  app.patch("/api/scores/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const score = await storage.updateScore(id, req.body);
      if (!score) return res.status(404).json({ error: "Score not found" });
      res.json(score);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Update failed" });
    }
  });

  app.delete("/api/scores/:id", async (req, res) => {
    try {
      await storage.deleteScore(Number(req.params.id));
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ error: "Failed to delete score" });
    }
  });

  app.post("/api/scores/:id/notes", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const notes = z.array(noteEventSchema).parse(req.body.notes);
      const score = await storage.appendNotes(id, notes);
      if (!score) return res.status(404).json({ error: "Score not found" });
      res.json(score);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Invalid notes" });
    }
  });

  // ============== AUDIO TRANSCRIPTION ==============

  app.post("/api/transcribe-notes", async (req, res) => {
    try {
      const { audio, instrument = "beatbox", bpm = 120 } = req.body;

      if (!audio) {
        return res.status(400).json({ error: "Audio data (base64) is required" });
      }

      const rawBuffer = Buffer.from(audio, "base64");

      if (instrument === "beatbox") {
        return await handleBeatboxTranscription(rawBuffer, bpm, res);
      }

      return res.status(400).json({
        error: "Only beatbox mode is currently supported. Other instruments coming soon."
      });
    } catch (e: any) {
      console.error("Transcription error:", e);
      res.status(500).json({ error: "Transcription failed", details: e.message });
    }
  });

  async function handleBeatboxTranscription(rawBuffer: Buffer, bpm: number, res: any) {
    const wavBuffer = await convertToAnalysisWav(rawBuffer);

    const { events: rawEvents, stats } = transcribeWav(wavBuffer, {
      bpm,
      onsetThreshold: 0.12,
      minInterOnsetMs: 100,
      silenceRmsThreshold: 0.02,
      restMinMs: 200,
      subdivision: 8,
    });

    if (DEBUG) {
      console.log("[beatbox-transcribe] Stats:", stats);
      console.log("[beatbox-transcribe] Raw events:", JSON.stringify(rawEvents, null, 2));
    }

    const hitEvents = rawEvents.filter(e => e.type === "hit");

    if (hitEvents.length === 0) {
      return res.json({
        bpm,
        timeSignature: "4/4",
        notes: [],
        final: true,
        ...(DEBUG ? { debug: { rawEvents, stats } } : {}),
      });
    }

    const labels = await classifyDrumHits(hitEvents, bpm);

    const beatDurMs = 60000 / bpm;
    const notes: any[] = [];

    let eventIndex = 0;
    for (const raw of rawEvents) {
      if (raw.type === "hit") {
        const label = labels[eventIndex] || { drum: "perc", confidence: 0.5 };
        eventIndex++;

        notes.push({
          kind: "drum",
          drum: label.drum,
          time: raw.tMs / 1000,
          duration: raw.durMs / 1000,
          velocity: Math.round(raw.amp * 127) / 127,
          confidence: label.confidence,
          instrument: "beatbox",
          isRest: false,
        });
      } else {
        notes.push({
          kind: "rest",
          time: raw.tMs / 1000,
          duration: raw.durMs / 1000,
          confidence: 1,
          instrument: "beatbox",
          isRest: true,
        });
      }
    }

    res.json({
      bpm,
      timeSignature: "4/4",
      notes,
      final: true,
      ...(DEBUG ? { debug: { rawEvents, stats, labels } } : {}),
    });
  }

  async function classifyDrumHits(
    hits: RawDrumEvent[],
    bpm: number
  ): Promise<Array<{ drum: string; confidence: number }>> {
    try {
      const hitsForAI = hits.map((h, i) => ({
        index: i,
        tMs: Math.round(h.tMs),
        amp: parseFloat(h.amp.toFixed(3)),
        zcr: h.features?.zcr ? parseFloat(h.features.zcr.toFixed(4)) : undefined,
        bandEnergy: h.features?.bandEnergy ? {
          low: parseFloat(h.features.bandEnergy.low.toFixed(4)),
          mid: parseFloat(h.features.bandEnergy.mid.toFixed(4)),
          high: parseFloat(h.features.bandEnergy.high.toFixed(4)),
        } : undefined,
      }));

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a drum sound classifier. You receive a list of detected percussive hit events with their timing, amplitude, zero-crossing rate, and frequency band energy.

Your task: Label EACH hit with a drum type. You must return EXACTLY ${hits.length} labels in the same order.

Available drum labels: kick, snare, closed_hat, open_hat, clap, tom_low, tom_mid, tom_high, rim, perc

Classification hints:
- kick: high low-band energy, low ZCR, high amplitude
- snare: strong mid-band energy, medium-high ZCR, strong amplitude
- closed_hat: high ZCR, dominant high-band energy, lower amplitude
- open_hat: high ZCR, high-band energy, longer sustain feel
- clap: broadband energy, medium ZCR
- tom_low/mid/high: tonal quality, corresponding band energy
- rim: sharp transient, low amplitude, high ZCR
- perc: anything uncertain

Rules:
- Return EXACTLY ${hits.length} items
- Do NOT add or remove hits
- If uncertain, use "perc" with lower confidence
- confidence must be 0 to 1

Return ONLY valid JSON: { "labels": [{ "drum": "kick", "confidence": 0.9 }, ...] }`
          },
          {
            role: "user",
            content: `BPM: ${bpm}. Classify these ${hits.length} drum hits:\n${JSON.stringify(hitsForAI)}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
      const labels = result.labels || [];

      if (labels.length !== hits.length) {
        console.warn(`AI returned ${labels.length} labels for ${hits.length} hits, padding/trimming`);
        while (labels.length < hits.length) {
          labels.push({ drum: "perc", confidence: 0.3 });
        }
        labels.length = hits.length;
      }

      return labels;
    } catch (err) {
      console.error("AI drum classification failed, using fallback:", err);
      return hits.map(h => {
        if (h.features?.bandEnergy) {
          const { low, mid, high } = h.features.bandEnergy;
          if (low > mid && low > high) return { drum: "kick", confidence: 0.4 };
          if (high > mid && high > low) return { drum: "closed_hat", confidence: 0.4 };
          if (mid > low && mid > high) return { drum: "snare", confidence: 0.4 };
        }
        return { drum: "perc", confidence: 0.3 };
      });
    }
  }

  // ============== STRIPE CHECKOUT FOR EXPORTS ==============

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (e) {
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  });

  app.get("/api/export-prices", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        AND p.metadata->>'app' = 'baseline'
        ORDER BY pr.unit_amount ASC
      `);
      res.json({ prices: result.rows });
    } catch (e: any) {
      console.error("Error fetching prices:", e);
      res.json({ prices: [] });
    }
  });

  app.post("/api/scores/:id/checkout", async (req, res) => {
    try {
      const scoreId = Number(req.params.id);
      const { formats, format } = req.body;

      const requestedFormats: string[] = formats || (format ? [format] : []);
      const validFormats = requestedFormats.filter((f: string) => ["musicxml", "midi"].includes(f));

      if (validFormats.length === 0) {
        return res.status(400).json({ error: "At least one valid format (musicxml, midi) is required" });
      }

      const score = await storage.getScore(scoreId);
      if (!score) return res.status(404).json({ error: "Score not found" });

      const lineItems: Array<{ price: string; quantity: number }> = [];
      const exportIds: number[] = [];

      for (const fmt of validFormats) {
        const result = await db.execute(sql`
          SELECT pr.id as price_id, pr.unit_amount
          FROM stripe.products p
          JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
          WHERE p.active = true
          AND p.metadata->>'app' = 'baseline'
          AND p.metadata->>'format' = ${fmt}
          LIMIT 1
        `);

        const priceRow = result.rows[0] as any;
        if (!priceRow) {
          return res.status(404).json({ error: `No price found for ${fmt} export` });
        }

        const exp = await storage.createExport({
          scoreId: score.id,
          format: fmt,
          priceCents: Number(priceRow.unit_amount),
          paid: false,
          stripeSessionId: null,
        });

        lineItems.push({ price: priceRow.price_id, quantity: 1 });
        exportIds.push(exp.id);
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${baseUrl}/checkout/success?score_id=${scoreId}&formats=${validFormats.join(',')}&export_ids=${exportIds.join(',')}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/desktop?cancelled=true`,
        metadata: {
          scoreId: String(scoreId),
          exportIds: exportIds.join(','),
          formats: validFormats.join(','),
        },
      });

      for (const expId of exportIds) {
        await storage.updateExportStripeSession(expId, session.id);
      }

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Checkout error:", e);
      res.status(500).json({ error: "Checkout failed" });
    }
  });

  // ============== VERIFY PAYMENT ==============

  app.post("/api/verify-payment", async (req, res) => {
    try {
      const { scoreId, formats, exportIds, sessionId } = req.body;

      if (!scoreId || !sessionId || !formats || !exportIds) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const numericScoreId = Number(scoreId);
      const ids = Array.isArray(exportIds) ? exportIds.map(Number) : String(exportIds).split(',').map(Number);
      const fmtList = Array.isArray(formats) ? formats : String(formats).split(',');

      for (let i = 0; i < ids.length; i++) {
        const exp = await storage.getExport(ids[i]);
        if (!exp || exp.scoreId !== numericScoreId || exp.format !== fmtList[i]) {
          return res.status(403).json({ error: "Export record mismatch" });
        }
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        return res.json({ paid: false });
      }

      for (const expId of ids) {
        const exp = await storage.getExport(expId);
        if (exp && exp.stripeSessionId === session.id && !exp.paid) {
          await storage.markExportPaid(expId);
        }
      }

      res.json({ paid: true });
    } catch (e: any) {
      console.error("Payment verification error:", e);
      res.status(500).json({ error: "Payment verification failed" });
    }
  });

  // ============== EXPORT DOWNLOAD (after payment) ==============

  app.get("/api/scores/:id/export/:format/download", async (req, res) => {
    try {
      const scoreId = Number(req.params.id);
      const format = req.params.format;
      const sessionId = req.query.session_id as string;
      const exportId = req.query.export_id ? Number(req.query.export_id) : null;

      if (!sessionId || !exportId) {
        return res.status(400).json({ error: "Missing payment information" });
      }

      const exp = await storage.getExport(exportId);
      if (!exp || exp.scoreId !== scoreId || exp.format !== format) {
        return res.status(403).json({ error: "Invalid export record" });
      }

      if (!exp.paid) {
        const stripe = await getUncachableStripeClient();
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== 'paid') {
          return res.status(402).json({ error: "Payment not completed" });
        }

        if (exp.stripeSessionId !== session.id) {
          return res.status(403).json({ error: "Session mismatch" });
        }

        await storage.markExportPaid(exportId);
      }

      const score = await storage.getScore(scoreId);
      if (!score) return res.status(404).json({ error: "Score not found" });

      if (format === "musicxml") {
        const xml = generateMusicXML(
          score.notes || [],
          score.title,
          score.artist,
          score.bpm,
          score.timeSignature
        );
        res.setHeader("Content-Type", "application/vnd.recordare.musicxml+xml");
        res.setHeader("Content-Disposition", `attachment; filename="${score.title.replace(/[^a-zA-Z0-9]/g, '_')}.musicxml"`);
        res.send(xml);
      } else if (format === "midi") {
        const midi = generateMidi(score.notes || [], score.bpm);
        res.setHeader("Content-Type", "audio/midi");
        res.setHeader("Content-Disposition", `attachment; filename="${score.title.replace(/[^a-zA-Z0-9]/g, '_')}.mid"`);
        res.send(midi);
      } else {
        res.status(400).json({ error: "Invalid format" });
      }
    } catch (e: any) {
      console.error("Download error:", e);
      res.status(500).json({ error: "Download failed" });
    }
  });

  app.get("/api/scores/:id/export/json", async (req, res) => {
    try {
      const score = await storage.getScore(Number(req.params.id));
      if (!score) return res.status(404).json({ error: "Score not found" });

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${score.title.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
      res.json({
        title: score.title,
        artist: score.artist,
        bpm: score.bpm,
        timeSignature: score.timeSignature,
        notes: score.notes,
      });
    } catch (e) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  return httpServer;
}
