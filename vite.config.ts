import { defineConfig } from "vite-plus";

// The MP API only allows CORS from materialsproject.org, so the local dev/preview
// servers forward /mp-api/* to it. Static hosting has no such proxy.
const mpProxy = {
  "/mp-api": {
    target: "https://api.materialsproject.org",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/mp-api/, ""),
  },
};

export default defineConfig({
  // Relative asset paths so dist/ works from any sub-path or file host.
  base: "./",
  server: { proxy: mpProxy },
  preview: { proxy: mpProxy },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
