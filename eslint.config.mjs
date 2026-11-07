import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    ".next/**",
    ".local/**",
    ".superpowers/**",
    "backups/**",
    "payload-types.ts",
    "next-env.d.ts",
    "src/migrations/**",
    "src/app/(payload)/admin/importMap.js",
  ]),
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        btoa: "readonly",
        atob: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        FormData: "readonly",
        crypto: "readonly",
        structuredClone: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-expressions": "warn",
      "prefer-const": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
      // Existing adapters intentionally avoid logging credential-bearing causes.
      "preserve-caught-error": "warn",
    },
  },
  {
    files: ["tests/**"],
    rules: { "no-unsafe-finally": "warn" },
  },
  prettier,
  {
    files: [
      "src/server/intake.ts",
      "src/server/content/service.ts",
      "src/lib/immigration-policy.ts",
      "src/server/customer/service.ts",
      "src/server/support/service.ts",
      "src/server/business/service.ts",
      "src/server/workflow/service.ts",
      "src/cms/access.ts",
      "src/cms/collections.ts",
      "src/cms/**/collections.ts",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    rules: { "max-statements-per-line": ["error", { max: 1 }] },
  },
]);
