import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, real, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const drumLabels = [
  "kick", "snare", "closed_hat", "open_hat", "clap",
  "tom_low", "tom_mid", "tom_high", "rim", "perc"
] as const;

export const melodicNoteSchema = z.object({
  id: z.string().optional(),
  kind: z.literal("melodic").optional(),
  time: z.number(),
  duration: z.number(),
  midi: z.number(),
  velocity: z.number(),
  confidence: z.number(),
  instrument: z.string(),
  isRest: z.literal(false).optional(),
});

export const drumNoteSchema = z.object({
  id: z.string().optional(),
  kind: z.literal("drum"),
  drum: z.enum(drumLabels),
  time: z.number(),
  duration: z.number(),
  velocity: z.number(),
  confidence: z.number(),
  instrument: z.string(),
  isRest: z.literal(false).optional(),
});

export const restEventSchema = z.object({
  id: z.string().optional(),
  kind: z.literal("rest"),
  time: z.number(),
  duration: z.number(),
  confidence: z.number(),
  instrument: z.string(),
  isRest: z.literal(true),
});

export const noteEventSchema = z.union([melodicNoteSchema, drumNoteSchema, restEventSchema]);

export type NoteEvent = z.infer<typeof noteEventSchema>;

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Untitled Score"),
  artist: text("artist").notNull().default("Baseline User"),
  bpm: integer("bpm").notNull().default(100),
  timeSignature: text("time_signature").notNull().default("4/4"),
  notes: jsonb("notes").$type<NoteEvent[]>().notNull().default([]),
  instrument: text("instrument").notNull().default("beatbox"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const exports = pgTable("exports", {
  id: serial("id").primaryKey(),
  scoreId: integer("score_id").notNull().references(() => scores.id, { onDelete: "cascade" }),
  format: text("format").notNull(),
  priceCents: integer("price_cents").notNull(),
  stripeSessionId: text("stripe_session_id"),
  paid: boolean("paid").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertScoreSchema = createInsertSchema(scores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExportSchema = createInsertSchema(exports).omit({
  id: true,
  createdAt: true,
});

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Export = typeof exports.$inferSelect;
export type InsertExport = z.infer<typeof insertExportSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
