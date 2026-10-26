import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, ".") };
const oxc = { jsx: { runtime: "automatic" as const } };

export default defineConfig({
  oxc,
  resolve: { alias },
  test: {
    projects: [
      {
        oxc,
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/unit/vitest-setup.ts"],
        },
      },
      {
        oxc,
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/unit/vitest-setup.ts"],
        },
      },
    ],
  },
});
