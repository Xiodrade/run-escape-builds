import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Relative paths, so the site works at any address (a GitHub Pages project
// site is served from /<repo>/)
export default defineConfig({
    base: "./",
    plugins: [react()],
    test: { include: ["src/**/*.test.ts"], globals: true },
});
