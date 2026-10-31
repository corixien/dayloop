import { useEffect } from "react";
import { local, useSettings } from "./app";
import { todayStr } from "./dates";
import { isNative } from "./native";
import { compareTasks, isOpen } from "./tasks";

const MAX = 6;

/** Native only: push today's open tasks to the home screen widget whenever tasks change. */
export function useWidgetSync() {
  const lang = useSettings().language;
  useEffect(() => {
    if (!isNative()) return;
    let timer: ReturnType<typeof setTimeout>;
    const push = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const today = todayStr();
        const open = (await local.all("task")).filter(isOpen).sort(compareTasks);
        const { registerPlugin } = await import("@capacitor/core");
        const w = registerPlugin<{ update(o: object): Promise<void> }>("DayloopWidget");
        await w.update({
          title: "Todo",
          items: open.slice(0, MAX).map((t) => (t.dueDate && t.dueDate <= today ? `${t.dueTime ?? ""}  ${t.title}`.trim() : t.dueDate ? `${t.dueDate.slice(8)}.${t.dueDate.slice(5, 7)}.  ${t.title}` : t.title)),
          more: Math.max(0, open.length - MAX),
        });
      }, 800);
    };
    local.db.items.hook("creating", push);
    local.db.items.hook("updating", push);
    push();
    const day = setInterval(push, 15 * 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(day);
      local.db.items.hook("creating").unsubscribe(push);
      local.db.items.hook("updating").unsubscribe(push);
    };
  }, [lang]);
}
