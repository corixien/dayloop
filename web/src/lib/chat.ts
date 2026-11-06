import { local, useItems } from "./app";
import { type ChatMsg, trimChat } from "./chatLog";

export type { ChatMsg };
/** One synced record holds the history (the last 20 questions with their answers). */
const ID = "main";

export const useChat = (): ChatMsg[] => useItems("chat").find((x) => x.id === ID)?.messages ?? [];

let queue: Promise<unknown> = Promise.resolve();
/** Append messages; calls are serialized so quick successive writes cannot overwrite each other. */
export function addChat(...msgs: ChatMsg[]): Promise<void> {
  const run = queue.then(async () => {
    const cur = (await local.all("chat")).find((x) => x.id === ID)?.messages ?? [];
    await local.put("chat", ID, { messages: trimChat([...cur, ...msgs]) });
  });
  queue = run.catch(() => {});
  return run;
}
export const clearChat = () => local.remove("chat", ID);
