export interface ChatMsg { me: boolean; text: string; err?: boolean; at: number }
/** The history keeps the last `max` questions with everything that followed them. */
export function trimChat(all: ChatMsg[], max = 20): ChatMsg[] {
  const asks = all.flatMap((m, i) => (m.me ? [i] : []));
  return asks.length > max ? all.slice(asks[asks.length - max]) : all;
}
