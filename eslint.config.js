import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "node_modules/**", "apps/web/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // tsc (strict) couvre déjà les non-utilisés; le lint se concentre sur la correction.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "prefer-const": "error",
      "eqeqeq": ["error", "smart"]
    }
  }
);
