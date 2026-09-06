import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
export default ts.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "worker-configuration.d.ts",
      ".wrangler/**",
      ".local/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...ts.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/switch-exhaustiveness-check": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "jsx-a11y": a11y },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/worker/**",
                "**/worker-configuration*",
                "better-auth",
                "better-auth/*",
                "cloudflare:*",
              ],
              message:
                "Browser/shared code cannot import server implementation or bindings.",
            },
          ],
        },
      ],
    },
  },
);
