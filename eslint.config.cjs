const tseslint = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-config-prettier");
const sourceFiles = ["src/**/*.ts", "typings/**/*.ts"];

module.exports = [
  {
    ignores: [
      "**/*.test.ts",
      "vitest.config.ts",
      "eslint.config.cjs",
      "lib/**",
      "coverage/**",
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  ...tseslint.configs["flat/recommended-type-checked"].map((config) => ({
    ...config,
    files: sourceFiles,
  })),
  {
    files: sourceFiles,
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
        ecmaVersion: 2018,
        sourceType: "module",
      },
    },
  },
  prettier,
];
