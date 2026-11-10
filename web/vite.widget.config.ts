import { defineConfig } from "vite";

/** Second build: the headless widget bundle (one IIFE file next to the app in dist/, copied into the APK by `cap sync`). */
export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: { entry: "src/widgetBg.ts", formats: ["iife"], name: "DayloopBg", fileName: () => "widget-bg.js" },
  },
});
