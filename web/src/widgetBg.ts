/**
 * Headless entry for the home screen widget: the native refresh job (app closed) fetches tasks and plan blocks from the server
 * and calls `dayloopBuild` in a hidden WebView, so the widget is built by exactly the same code as when the app is open.
 */
import { itemSchemas } from "@dayloop/shared";
import { buildSnapshot } from "./lib/widgetSnapshot";
import type { Lang } from "./lib/i18n";
import type { TaskItem } from "./lib/taskLogic";

interface Envelope { id: string; data: unknown; updatedAt: number }
export interface BgInput {
  lang: Lang;
  hour: number;
  /** tracker connected on this device -> ids already sent; null = not connected */
  sent: string[] | null;
  now: number;
  tasks: Envelope[];
  plans: Envelope[];
  /** completions made in the widget that the server may not have yet */
  pending: { id: string; done: boolean; at: number }[];
}

const item = <T extends "task" | "plan">(type: T, e: Envelope) => {
  const p = itemSchemas[type].safeParse(e.data);
  return { ...(p.success ? p.data : (e.data as object)), id: e.id, updatedAt: e.updatedAt };
};

export function build(input: BgInput) {
  const tasks = input.tasks.map((e) => item("task", e) as unknown as TaskItem);
  for (const a of input.pending) {
    const t = tasks.find((x) => x.id === a.id);
    if (t && t.done !== a.done) { t.done = a.done; t.completedAt = a.done ? a.at : null; }
  }
  const blocks = input.plans.map((e) => item("plan", e) as never);
  return buildSnapshot(tasks, input.lang, new Date(input.now), input.sent ? { sent: new Set(input.sent) } : null, input.hour, blocks);
}

(globalThis as { dayloopBuild?: (json: string) => string }).dayloopBuild = (json) => JSON.stringify(build(JSON.parse(json) as BgInput));
