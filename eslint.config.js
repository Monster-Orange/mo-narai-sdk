import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ["scripts/**", "test/**", "src/harness/index.ts"], languageOptions: { globals: globals.node } },
  { files: ["test/fixtures/**"], languageOptions: { globals: globals.browser } },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }] } },
);
