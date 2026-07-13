import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // DB-backed tests each spin up an in-process PGlite (WASM) instance and
    // swap the shared db() via setDbForTests. Run test files serially so the
    // instances don't contend for WASM memory or clobber the global — keeps
    // the suite deterministic in CI.
    fileParallelism: false,
  },
});
