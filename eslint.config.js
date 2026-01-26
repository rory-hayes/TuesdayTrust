import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }]
    }
  },
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"]
  }
]
