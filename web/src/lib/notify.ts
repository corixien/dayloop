/** Fires an immediate notification: native when running inside Capacitor, Web Notification otherwise. */
export function notifyNow(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "/icon.svg" }); } catch { /* some mobile webviews throw */ }
  }
}
