import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.browser,
        // Electron app lifecycle variable shared across main.js functions
        launchedAtLogin: "writable",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "prefer-const": "warn",
      "no-console": "off",
      // Best-effort cleanup catches (stream destroy, res.end) are intentionally empty.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // escCh() intentionally escapes control characters and quotes for SSE safety.
      "no-control-regex": "off",
      "no-useless-escape": "off",
    },
  },
  {
    files: ["test/**/*.js", "server/**/*.test.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    ignores: ["node_modules/**", "dist/**", "server/types.js", "tools/**"],
  },
];
