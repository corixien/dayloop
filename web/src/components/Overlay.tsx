import { useEffect } from "react";
import { syncClient, useHashRoute, useSettings, useTheme } from "../lib/app";
import { pomo } from "../lib/pomoStore";
import { closeOverlay, useWidgetSync } from "../lib/widget";
import { NewItem } from "./NewItem";
import { Sheet } from "./Sheet";
import { TaskDetail } from "./TaskDetail";

/**
 * Opened by the home screen widget in a translucent activity: the same bottom sheets as in the app,
 * floating over the home screen. Routes: /overlay/task/<id>, /overlay/new/<todo|done>.
 */
export function Overlay() {
  const [route] = useHashRoute();
  const settings = useSettings();
  useTheme(settings.theme);
  useWidgetSync();
  useEffect(() => {
    document.documentElement.classList.add("overlay");
    syncClient.start();
    void syncClient.syncNow();
  }, []);

  const [, , kind, arg] = route.split("/");
  if (kind === "task" && arg) {
    return (
      <Sheet always onClose={() => void closeOverlay()}>
        {(close) => <TaskDetail id={arg} onClose={close} onFocus={(id) => { pomo.focusTask(id); close(); }} />}
      </Sheet>
    );
  }
  if (kind === "new") return <NewItem kind={arg === "done" ? "done" : "todo"} bare onClose={() => void closeOverlay()} />;
  return null;
}
