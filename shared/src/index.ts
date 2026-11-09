import { z } from "zod";

/** Every synced record is an envelope {type, id, data, updatedAt, deleted}. `data` is validated per type. */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const color = z.string().max(20);
const id = z.string().min(1).max(64);

export const repeatSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  /** 0 = Sunday .. 6 = Saturday, weekly only */
  byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: date.nullable().optional(),
  /** next date counts from completion instead of from due date */
  fromCompletion: z.boolean().optional(),
});

export const subtaskSchema = z.object({
  id,
  title: z.string().max(500),
  done: z.boolean(),
});

export const reminderSchema = z.object({
  /** minutes before due; 0 = at due time. Date-only tasks fire at 09:00 minus offset. */
  offsetMin: z.number().int().min(0).max(60 * 24 * 60),
});

export const folderSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().default(0),
});

export const columnSchema = z.object({ id, name: z.string().max(60) });

export const listSchema = z.object({
  name: z.string().min(1).max(100),
  color: color.default("gray"),
  folderId: id.nullable().default(null),
  order: z.number().default(0),
  view: z.enum(["list", "kanban"]).default("list"),
  columns: z.array(columnSchema).max(20).default([]),
  archived: z.boolean().default(false),
});

export const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: color.default("gray"),
});

export const taskSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(20000).default(""),
  listId: id.nullable().default(null),
  columnId: id.nullable().default(null),
  /** 0 none, 1 low, 2 medium, 3 high */
  priority: z.number().int().min(0).max(3).default(0),
  tags: z.array(id).max(30).default([]),
  startDate: date.nullable().default(null),
  dueDate: date.nullable().default(null),
  /** null = all-day */
  dueTime: time.nullable().default(null),
  reminders: z.array(reminderSchema).max(10).default([]),
  repeat: repeatSchema.nullable().default(null),
  subtasks: z.array(subtaskSchema).max(200).default([]),
  done: z.boolean().default(false),
  /** epoch ms */
  completedAt: z.number().nullable().default(null),
  order: z.number().default(0),
  /** estimated pomodoros */
  estimate: z.number().int().min(0).max(100).default(0),
  /** soft delete (trash), epoch ms */
  trashedAt: z.number().nullable().default(null),
  /** appointment: shown in the Todo list only this many minutes before its date/time (null = ordinary task, always shown) */
  showBeforeMin: z.number().int().min(0).max(525600).nullable().default(null),
});

export const habitSchema = z.object({
  name: z.string().min(1).max(100),
  color: color.default("green"),
  /** completions per day that count as done */
  target: z.number().int().min(1).max(100).default(1),
  unit: z.string().max(20).default(""),
  /** days of week the habit is active, 0 = Sunday */
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  startDate: date,
  reminderTime: time.nullable().default(null),
  archived: z.boolean().default(false),
  order: z.number().default(0),
});

/** id = `${habitId}_${date}` so offline devices converge on one record per day */
export const habitLogSchema = z.object({
  habitId: id,
  date,
  count: z.number().int().min(0).max(10000),
});

export const pomodoroSchema = z.object({
  taskId: id.nullable().default(null),
  kind: z.enum(["work", "break"]),
  startedAt: z.number(),
  /** planned and actual seconds */
  plannedSec: z.number().int().min(1),
  actualSec: z.number().int().min(0),
  completed: z.boolean(),
});

export const settingsSchema = z.object({
  workMin: z.number().int().min(1).max(180).default(25),
  breakMin: z.number().int().min(1).max(60).default(5),
  longBreakMin: z.number().int().min(1).max(120).default(15),
  longBreakEvery: z.number().int().min(0).max(12).default(4),
  autoStart: z.boolean().default(false),
  weekStart: z.union([z.literal(0), z.literal(1)]).default(1),
  language: z.enum(["de", "en"]).default("de"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  /** hour of day (0-23) for date-only reminders */
  defaultReminderHour: z.number().int().min(0).max(23).default(9),
  /** default lists the user removed from navigation */
  hiddenSmart: z.array(z.enum(["inbox", "today", "next7", "all", "done"])).default([]),
  /** Groq API key for the voice assistant, synced so every device of the account can use it */
  groqKey: z.string().max(200).default(""),
  /** Productivity-Tracker login and the ids already sent, so a new device starts fully set up */
  trackerUrl: z.string().max(300).default(""),
  trackerUser: z.string().max(200).default(""),
  trackerPass: z.string().max(200).default(""),
  trackerSent: z.array(z.string().max(80)).max(1000).default([]),
});

/** Motivation page: own texts, subscribed podcasts and own audio files (the file itself is a server blob). */
export const motextSchema = z.object({
  title: z.string().max(200).default(""),
  body: z.string().max(80_000).default(""),
  createdAt: z.number().default(0),
});
export const mofeedSchema = z.object({
  url: z.string().max(1000),
  title: z.string().max(300).default(""),
  image: z.string().max(1000).default(""),
  author: z.string().max(300).default(""),
});
export const moaudioSchema = z.object({
  name: z.string().max(200).default(""),
  size: z.number().default(0),
  mime: z.string().max(100).default("audio/mpeg"),
  createdAt: z.number().default(0),
});

/** Assistant chat history: one record ("main") holding the last messages (about 20 exchanges). */
export const chatSchema = z.object({
  messages: z.array(z.object({ me: z.boolean(), text: z.string().max(4000), err: z.boolean().optional(), at: z.number().default(0) })).max(80).default([]),
});

/** Plan page: time blocks of a day (made by Claude through the MCP or by hand). Checklist lines live in `notes` like in tasks. */
/** A todo shown inside a plan block; `points` null = all its checklist points, else only those point ids. */
export const planEntrySchema = z.object({
  taskId: id,
  points: z.array(z.string().max(16)).max(200).nullable().default(null),
});

export const planSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(20000).default(""),
  date,
  start: time,
  /** end of the block, after `start` on the same day (latest 23:59) */
  end: time,
  /** real todos (and their checklist points) shown below the block title, in order */
  entries: z.array(planEntrySchema).max(100).default([]),
});

export const itemSchemas = {
  folder: folderSchema,
  list: listSchema,
  tag: tagSchema,
  task: taskSchema,
  habit: habitSchema,
  habitlog: habitLogSchema,
  pomodoro: pomodoroSchema,
  settings: settingsSchema,
  motext: motextSchema,
  mofeed: mofeedSchema,
  moaudio: moaudioSchema,
  chat: chatSchema,
  plan: planSchema,
} as const;

export type ItemType = keyof typeof itemSchemas;
export const ITEM_TYPES = Object.keys(itemSchemas) as ItemType[];
export const isItemType = (t: unknown): t is ItemType => typeof t === "string" && t in itemSchemas;

export type Folder = z.infer<typeof folderSchema>;
export type List = z.infer<typeof listSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitLog = z.infer<typeof habitLogSchema>;
export type Pomodoro = z.infer<typeof pomodoroSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type MoText = z.infer<typeof motextSchema>;
export type MoFeed = z.infer<typeof mofeedSchema>;
export type MoAudio = z.infer<typeof moaudioSchema>;
export type Chat = z.infer<typeof chatSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanEntry = z.infer<typeof planEntrySchema>;
export type Repeat = z.infer<typeof repeatSchema>;
export type Subtask = z.infer<typeof subtaskSchema>;

export interface DataOf {
  folder: Folder;
  list: List;
  tag: Tag;
  task: Task;
  habit: Habit;
  habitlog: HabitLog;
  pomodoro: Pomodoro;
  settings: Settings;
  motext: MoText;
  mofeed: MoFeed;
  moaudio: MoAudio;
  chat: Chat;
  plan: Plan;
}

/** Wire format for sync. `data` is the validated payload, ignored for tombstones. */
export interface Change {
  type: ItemType;
  id: string;
  data: unknown;
  updatedAt: number;
  deleted: boolean;
}

export interface ServerChange extends Change {
  seq: number;
}

export interface SyncRequest {
  cursor: number;
  changes: Change[];
}

export interface SyncResponse {
  changes: ServerChange[];
  cursor: number;
  hasMore: boolean;
  /** pushed changes the server did not apply, with reason ("stale" | "invalid") */
  rejected: { type: ItemType; id: string; reason: string }[];
}

export const changeSchema = z.object({
  type: z.string().refine(isItemType, "unknown type"),
  id: id,
  data: z.unknown(),
  updatedAt: z.number().int().positive(),
  deleted: z.boolean(),
});

export const syncRequestSchema = z.object({
  cursor: z.number().int().min(0),
  changes: z.array(changeSchema).max(500),
});

/** Parse+default a payload for a type. Throws ZodError. */
export function parseData<T extends ItemType>(type: T, data: unknown): DataOf[T] {
  return itemSchemas[type].parse(data) as DataOf[T];
}

export function habitLogId(habitId: string, d: string): string {
  return `${habitId}_${d}`;
}
