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
      const { audio, instrument = "humming", bpm = 100 } = req.body;

      if (!audio) {
        return res.status(400).json({ error: "Audio data (base64) is required" });
      }

      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer: audioBuffer, format: inputFormat } = await ensureCompatibleFormat(rawBuffer);

      const file = await toFile(audioBuffer, `audio.${inputFormat}`);
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });

      const userDescription = transcription.text;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content: `You are a music transcription AI. The user recorded a melody by ${instrument}. 
Based on the audio transcription description, generate musically plausible note events.
Return ONLY valid JSON matching this schema:
{
  "bpm": number,
  "timeSignature": "4/4",
  "notes": [{ "time": 0.0, "duration": 0.5, "midi": 60, "velocity": 0.8, "confidence": 0.9 }],
  "final": true
}
Generate realistic melodic notes based on the description. Use MIDI values 48-84 (C3 to C6).
Keep the melody musical and coherent. Quantize to the nearest 1/8 note at ${bpm} BPM.
If the transcription is just speech/talking, still generate a simple melody inspired by the speech rhythm.`
          },
          {
            role: "user",
            content: `Audio transcription: "${userDescription}". Instrument: ${instrument}. BPM: ${bpm}. Generate note events for this melody.`
          }
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (e: any) {
      console.error("Transcription error:", e);
      res.status(500).json({ error: "Transcription failed", details: e.message });
    }
  });

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
      const { format } = req.body;

      if (!format || !["musicxml", "midi"].includes(format)) {
        return res.status(400).json({ error: "Format must be 'musicxml' or 'midi'" });
      }

      const score = await storage.getScore(scoreId);
      if (!score) return res.status(404).json({ error: "Score not found" });

      const result = await db.execute(sql`
        SELECT pr.id as price_id, pr.unit_amount
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        AND p.metadata->>'app' = 'baseline'
        AND p.metadata->>'format' = ${format}
        LIMIT 1
      `);

      const priceRow = result.rows[0] as any;
      if (!priceRow) {
        return res.status(404).json({ error: `No price found for ${format} export` });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const exp = await storage.createExport({
        scoreId: score.id,
        format,
        priceCents: Number(priceRow.unit_amount),
        paid: false,
        stripeSessionId: null,
      });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceRow.price_id, quantity: 1 }],
        mode: 'payment',
        success_url: `${baseUrl}/api/scores/${scoreId}/export/${format}/download?export_id=${exp.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/desktop?cancelled=true`,
        metadata: {
          scoreId: String(scoreId),
          exportId: String(exp.id),
          format,
        },
      });

      await storage.updateExportStripeSession(exp.id, session.id);

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Checkout error:", e);
      res.status(500).json({ error: "Checkout failed" });
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

  // Free JSON export
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
