import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["dotenv/config"],
    globalSetup: ["./tests/global-setup.ts"],
    // Integration tests share one test database.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
