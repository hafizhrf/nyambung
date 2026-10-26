import { z } from "zod";
export const mabarModes = ["chain", "quick", "semantic", "word"] as const;
export type MabarMode = (typeof mabarModes)[number];
export const modeLabels: Record<MabarMode, string> = {
  chain: "Rantai Gambar",
  quick: "Tebak Cepat",
  semantic: "Nyambung Bareng",
  word: "Sambung Kata",
};
export const roomSettings = z.object({
  name: z.string().trim().min(2).max(40),
  visibility: z.enum(["public", "unlisted"]).default("public"),
  capacity: z.number().int().min(2).max(12).default(8),
  mode: z.enum(mabarModes).default("quick"),
  rounds: z.number().int().default(10),
  seconds: z.number().int().default(20),
  pace: z.enum(["fast", "normal", "relaxed"]).default("normal"),
  password: z.string().max(64).optional(),
});
export type RoomSettings = z.infer<typeof roomSettings>;
export interface GuestProfile {
  id: string;
  name: string;
  avatar: string | null;
}
export interface RoomSummary {
  id: string;
  name: string;
  mode: MabarMode;
  visibility: "public" | "unlisted";
  capacity: number;
  count: number;
  locked: boolean;
  phase: string;
  source: "web" | "discord";
}
export interface Member extends GuestProfile {
  ready: boolean;
  online: boolean;
  host: boolean;
  spectator: boolean;
  score: number;
  rank: number;
}
export interface Stroke {
  color: string;
  size: number;
  points: [number, number][];
}
export interface ChainEntry {
  playerId: string;
  text?: string;
  drawing?: Stroke[];
  skipped?: boolean;
}
export interface MatchView {
  id: string;
  mode: MabarMode;
  phase: "countdown" | "playing" | "reveal" | "gallery" | "voting" | "results";
  stage: number;
  total: number;
  deadline: number;
  prompt: string;
  clues?: string[];
  turn?: string;
  submitted: boolean;
  task?: "text" | "drawing";
  previous?: ChainEntry;
  draft?: ChainEntry;
  gallery?: { owner: string; entries: ChainEntry[] }[];
  galleryIndex?: number;
  reveal?: {
    answer: string;
    answers: {
      playerId: string;
      word: string;
      score: number;
      connections?: number[];
    }[];
  };
  voted?: boolean;
}
export interface RoomView extends RoomSummary {
  revision: number;
  serverTime: number;
  self: string;
  settings: Omit<RoomSettings, "password">;
  members: Member[];
  match: MatchView | null;
  messages: { id: string; playerId: string; text: string }[];
  notice: string;
}
export const commandSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "ready",
    "settings",
    "start",
    "kick",
    "ban",
    "host",
    "answer",
    "draft",
    "submit",
    "gallery-next",
    "vote",
    "chat",
    "lobby",
  ]),
  matchId: z.string().optional(),
  stage: z.number().int().optional(),
  payload: z.unknown().optional(),
});
export type MabarCommand = z.infer<typeof commandSchema>;
export type MabarEvent =
  | { type: "snapshot"; room: RoomView }
  | { type: "error"; error: string; id?: string }
  | { type: "ack"; id: string };
export const drawingSchema = z
  .array(
    z.object({
      color: z.string().regex(/^#[0-9a-f]{6}$/i),
      size: z.number().min(1).max(32),
      points: z
        .array(
          z.tuple([z.number().min(0).max(800), z.number().min(0).max(500)]),
        )
        .min(1)
        .max(2000),
    }),
  )
  .max(300)
  .refine(
    (s) => s.reduce((n, v) => n + v.points.length, 0) <= 6000,
    "Gambar terlalu besar.",
  );
