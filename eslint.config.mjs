import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tsParser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    // next/core-web-vitals sets a top-level Babel-based parser that, once
    // resolved through FlatCompat, has no `meta` object and so can't be
    // serialized by ESLint 9 ("Cannot serialize key \"parse\" in parser").
    // TypeScript files already use @typescript-eslint/parser; point JS/JSX at
    // it too — it parses these fine and serializes cleanly, so the Babel parser
    // is no longer used by any file and the warning goes away.
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
];

export default eslintConfig;
