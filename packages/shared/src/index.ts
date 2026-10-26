import { z } from 'zod';
export const answerInput = z.object({ stage: z.number().int().min(0).max(4), word: z.string().max(64).optional(), skip: z.boolean().optional() }).refine(v => v.skip === true || !!v.word?.trim(), { message: 'Tulis satu kata dulu, ya.' });
export const startDailyInput = z.object({ date: z.string().optional() });
export type StageKind = 'bridge2' | 'bridge3' | 'closest';
export interface StagePrompt { index: number; kind: StageKind; clues: string[] }
export interface StageResult extends StagePrompt { word: string | null; score: number; connections: number[]; similarities?: number[]; rank?: number; vocabularySize?: number; best: string; explanation: string; skipped: boolean }
export type GameMode = 'daily' | 'random';
export interface DailyComparison { histogram: number[]; ownScore: number | null; players: number; average: number; best: number; rank: number | null; abovePercent: number | null; }
export interface RandomView { available: boolean; run: RunView | null }
export interface RunView { mode: GameMode; id: string; date: string; number: number; demo: boolean; completed: boolean; total: number; results: StageResult[]; current: StagePrompt | null }
export interface DailyView { date: string; serverTime: string; resetsAt: string; available: boolean; number: number | null; demo: boolean; run: RunView | null }
export interface ArchiveEntry { date: string; number: number; demo: boolean; status: 'new' | 'in_progress' | 'completed' }
export interface ArchiveView { today: string; entries: ArchiveEntry[]; nextBefore: string | null }
export interface Stats { completed: number; streak: number; best: number; average: number }
export interface DiscordParticipantProgress { id: string; name: string; avatar: string | null; stages: number; completed: boolean; total: number | null }
export interface DiscordRoomProgress { date: string; number: number | null; participants: DiscordParticipantProgress[] }
export interface DiscordServerScores { date:string; totalPlayers:number; players:{id:string; name:string; avatar:string|null; score:number; rank:number}[] }
export interface DiscordAuthResult { accessToken: string; sessionToken: string; expiresAt: number; user: { id: string; name: string }; instanceId: string }
export const normalizeWord = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('id-ID');
export const stageNames: Record<StageKind, string> = { bridge2: 'Di tengah kata', bridge3: 'Tiga sambungan', closest: 'Sedekat makna' };

export { crtImage } from './crtImage.js';
export * from './mabar.js';
