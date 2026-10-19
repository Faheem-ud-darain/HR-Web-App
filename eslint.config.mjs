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
    // Not this app's source: vendored/third-party or generated code, native
    // project folders, and the separately-packaged desktop tracker (Python).
    ".agents/**",
    ".claude/**",
    "android/**",
    "ios/**",
    "tracker-agent/**",
    "migration_data/**",
    "public/**",
    "coverage/**",
  ]),

  // Standard conventions for intentionally-unused names: a leading underscore
  // marks an argument/variable that is deliberately ignored, and pulling a field
  // out of an object just to leave it out of the rest (`const { password, ...safe } = x`)
  // is the usual way to omit a property.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },

  // Every <img> in this app shows a user-supplied picture (avatars, the crop and
  // preview dialogs, lightbox, attachments) whose source is a data:/blob: URL or a
  // PocketBase file URL. next/image can't optimise those, and the native-app build
  // runs with image optimisation switched off anyway (see next.config.ts), so the
  // rule's advice would add wrappers without any benefit.
  {
    rules: { "@next/next/no-img-element": "off" },
  },

  // PocketBase hook scripts run in PocketBase's own JS engine (goja), not in
  // Node or the browser: they use its globals (cronAdd, $app, ...) and its
  // CommonJS-style require(), and the `/// <reference path>` on line 1 is what
  // gives editors those globals' types. That engine is old enough that an
  // optional catch binding (`catch {}`) isn't safe, so `catch (err)` has to stay
  // even when err isn't read.
  {
    files: ["pb_hooks/**/*.js"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { caughtErrors: "none", argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
]);

export default eslintConfig;
