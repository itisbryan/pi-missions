import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests in Node environment
    environment: "node",
  },
  resolve: {
    // Allow importing .ts files directly without needing .js extensions
    extensions: [".ts", ".js"],
  },
  esbuild: {
    target: "es2022",
  },
});
