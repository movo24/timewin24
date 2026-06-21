import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client (not authored).
    "src/generated/**",
  ]),
  {
    rules: {
      // Conventional unused-vars config:
      // - `_`-prefixed args/vars are intentional (e.g. unused route `_req`).
      // - `ignoreRestSiblings`: destructuring to OMIT fields from a `...rest`
      //   spread is a deliberate pattern (e.g. stripping secrets before a
      //   response) — those names must NOT be flagged or "fixed" away.
      // - `caughtErrors: none`: unused `catch` bindings are allowed.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          caughtErrors: "none",
        },
      ],
    },
  },
]);

export default eslintConfig;
