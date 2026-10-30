import type { CapacitorConfig } from "@capacitor/cli";

// CAP_DEBUG=1 allows talking to a local http server (adb reverse) from the https WebView origin.
const debug = process.env.CAP_DEBUG === "1";

const config: CapacitorConfig = {
  appId: "com.dayloop.app",
  appName: "Dayloop",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { allowMixedContent: debug, adjustMarginsForEdgeToEdge: "auto" },
  plugins: { LocalNotifications: { smallIcon: "ic_stat_dayloop", iconColor: "#5B5BD6" } },
};

export default config;
