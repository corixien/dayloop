import { defineConfig } from "tsup";

// One self-contained ESM file for Render. The workspace package ships TypeScript source, so it must be bundled.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  noExternal: ["@dayloop/shared"],
  clean: true,
});
