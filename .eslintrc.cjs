module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: [
    '**/dist/**',
    '**/.next/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.vercel/**',
    '**/generated/**'
  ],
  overrides: [
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      extends: ['next/core-web-vitals']
    }
  ]
};
