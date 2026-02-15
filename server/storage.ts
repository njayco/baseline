import { db } from "./db";
import { scores, exports, type Score, type InsertScore, type Export, type InsertExport, type NoteEvent } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createScore(data: InsertScore): Promise<Score>;
  getScore(id: number): Promise<Score | undefined>;
  getAllScores(): Promise<Score[]>;
  updateScore(id: number, data: Partial<InsertScore>): Promise<Score | undefined>;
  deleteScore(id: number): Promise<void>;
  appendNotes(id: number, newNotes: NoteEvent[]): Promise<Score | undefined>;

  createExport(data: InsertExport): Promise<Export>;
  getExport(id: number): Promise<Export | undefined>;
  getExportByStripeSession(sessionId: string): Promise<Export | undefined>;
  updateExportStripeSession(id: number, sessionId: string): Promise<Export | undefined>;
  markExportPaid(id: number): Promise<Export | undefined>;
}

class DatabaseStorage implements IStorage {
  async createScore(data: InsertScore): Promise<Score> {
    const [score] = await db.insert(scores).values(data).returning();
    return score;
  }

  async getScore(id: number): Promise<Score | undefined> {
    const [score] = await db.select().from(scores).where(eq(scores.id, id));
    return score;
  }

  async getAllScores(): Promise<Score[]> {
    return db.select().from(scores).orderBy(desc(scores.updatedAt));
  }

  async updateScore(id: number, data: Partial<InsertScore>): Promise<Score | undefined> {
    const [score] = await db
      .update(scores)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scores.id, id))
      .returning();
    return score;
  }

  async deleteScore(id: number): Promise<void> {
    await db.delete(scores).where(eq(scores.id, id));
  }

  async appendNotes(id: number, newNotes: NoteEvent[]): Promise<Score | undefined> {
    const existing = await this.getScore(id);
    if (!existing) return undefined;
    const merged = [...(existing.notes || []), ...newNotes];
    return this.updateScore(id, { notes: merged });
  }

  async createExport(data: InsertExport): Promise<Export> {
    const [exp] = await db.insert(exports).values(data).returning();
    return exp;
  }

  async getExport(id: number): Promise<Export | undefined> {
    const [exp] = await db.select().from(exports).where(eq(exports.id, id));
    return exp;
  }

  async getExportByStripeSession(sessionId: string): Promise<Export | undefined> {
    const [exp] = await db.select().from(exports).where(eq(exports.stripeSessionId, sessionId));
    return exp;
  }

  async updateExportStripeSession(id: number, sessionId: string): Promise<Export | undefined> {
    const [exp] = await db
      .update(exports)
      .set({ stripeSessionId: sessionId })
      .where(eq(exports.id, id))
      .returning();
    return exp;
  }

  async markExportPaid(id: number): Promise<Export | undefined> {
    const [exp] = await db
      .update(exports)
      .set({ paid: true })
      .where(eq(exports.id, id))
      .returning();
    return exp;
  }
}

export const storage = new DatabaseStorage();
