import type { Reminder } from "./reminders";

export const isNative = () => typeof (window as any).Capacitor !== "undefined" && !!(window as any).Capacitor.isNativePlatform?.();

const idOf = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
};

/** Replace all pending OS notifications with the given reminders (Android alarms survive app close and reboot). */
export async function scheduleNative(reminders: Reminder[], _lang: string): Promise<void> {
  if (!isNative()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    if ((await LocalNotifications.requestPermissions()).display !== "granted") return;
  }
  await LocalNotifications.createChannel({ id: "reminders", name: "Erinnerungen / Reminders", importance: 4, vibration: true });
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.filter((n) => n.id < 2_000_000_000) });
  const list = reminders.slice(0, 60);
  if (!list.length) return;
  await LocalNotifications.schedule({
    notifications: list.map((r) => ({
      id: idOf(r.key), title: r.title, body: r.body, channelId: "reminders",
      schedule: { at: new Date(r.at), allowWhileIdle: true },
    })),
  });
}
