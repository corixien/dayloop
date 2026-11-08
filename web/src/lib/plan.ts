import { local, uid, useItems } from "./app";
import { type Block, byStart } from "./planLogic";

export const usePlan = (date: string): Block[] =>
  useItems("plan").filter((x) => x.date === date).map((x) => ({ id: x.id, title: x.title, notes: x.notes, date: x.date, start: x.start, end: x.end })).sort(byStart);

export const savePlan = (b: Omit<Block, "id"> & { id?: string }) =>
  local.put("plan", b.id ?? uid(), { title: b.title, notes: b.notes, date: b.date, start: b.start, end: b.end });
export const deletePlan = (id: string) => local.remove("plan", id);
