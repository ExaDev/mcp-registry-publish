import { defineConfig } from "eslint/config";
import exadev from "@exadev/eslint-config";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
// The recommended config both enables the prettier/prettier rule, which reports formatting differences as lint errors reading prettier.config.ts the same way `prettier --check` does, and turns off the eslint rules that would fight prettier.
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default defineConfig([
  // dist is build output and .turbo is turbo's cache; turbo writes single-line JSON manifests that trip prettier/prettier and json/no-unsafe-values.
  { ignores: ["dist/**", ".turbo/**"] },
  {
    files: ["**/*.{ts,mts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...exadev,
  {
    // node:test registers a test by calling describe or it and reports its result itself; awaiting each registration would run the tests in sequence at load instead of letting the runner schedule them.
    files: ["test/**/*.ts", "scripts/**/*.test.mts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
  {
    // A retry loop is the one shape whose awaits in a loop are the point: each attempt must finish and its backoff elapse before the next begins (src/publish.ts). noInlineConfig in the shared config bans the inline directive, so the carve-out lives here.
    files: ["src/publish.ts"],
    rules: { "no-await-in-loop": "off" },
  },
  {
    files: ["**/*.json"],
    ignores: ["turbo.json", "**/tsconfig*.json"],
    language: "json/json",
    plugins: { json },
    extends: ["json/recommended"],
  },
  {
    // tsconfig and turbo configs are JSONC: they may carry comments and trailing commas.
    files: ["turbo.json", "**/tsconfig*.json"],
    language: "json/jsonc",
    plugins: { json },
    extends: ["json/recommended"],
  },
  {
    // gfm, not commonmark: every markdown file here is rendered on GitHub and relies on GFM-only syntax such as tables.
    files: ["**/*.md"],
    // CHANGELOG.md is generated, and a commit subject containing `claude[bot]` reads its own `[bot]` as an unresolved reference-link label.
    ignores: ["CHANGELOG.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: ["markdown/recommended"],
  },
  eslintPluginPrettierRecommended,
]);
