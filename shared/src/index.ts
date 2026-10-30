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
