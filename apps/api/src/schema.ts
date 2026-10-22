import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const players = sqliteTable('players', { id: text('id').primaryKey(), createdAt: text('created_at').notNull() });
export const embeddings = sqliteTable('embeddings', { word: text('word').notNull(), model: text('model').notNull(), vector: text('vector').notNull() }, t => [primaryKey({ columns: [t.word, t.model] })]);
export const daily = sqliteTable('daily', { date: text('date').primaryKey(), number: integer('number').notNull(), demo: integer('demo', { mode: 'boolean' }).notNull(), snapshot: text('snapshot').notNull(), publishedAt: text('published_at').notNull() });
export const puzzleVersions = sqliteTable('puzzle_versions', { id: text('id').primaryKey(), snapshot: text('snapshot').notNull(), demo: integer('demo', { mode: 'boolean' }).notNull() });
export const runs = sqliteTable('runs', { id: text('id').primaryKey(), playerId: text('player_id').notNull().references(() => players.id), date: text('date').notNull(), mode: text('mode', { enum: ['daily', 'random'] }).notNull().default('daily'), stageOrder: text('stage_order'), completedAt: text('completed_at'), versionId: text('version_id').references(() => puzzleVersions.id), supersededAt: text('superseded_at') }, t => [uniqueIndex('one_active_daily_run').on(t.playerId, t.date).where(sql`${t.supersededAt} IS NULL AND ${t.mode} = 'daily'`), uniqueIndex('one_active_random_run').on(t.playerId).where(sql`${t.supersededAt} IS NULL AND ${t.mode} = 'random' AND ${t.completedAt} IS NULL`)]);
export const answers = sqliteTable('answers', { runId: text('run_id').notNull().references(() => runs.id), stage: integer('stage').notNull(), result: text('result').notNull() }, t => [primaryKey({ columns: [t.runId, t.stage] })]);

export const randomPool = sqliteTable('random_pool', { id: text('id').primaryKey(), versionId: text('version_id').notNull().references(() => puzzleVersions.id) });
