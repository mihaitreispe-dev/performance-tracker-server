import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

export default defineConfig([
  js.configs.recommended,
  tsEslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parser: tsEslint.parser,
      sourceType: 'module',
      parserOptions: {
        project: 'tsconfig.eslint.json',
      },
      globals: {
        ...globals.builtin,
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint.plugin,
      'unicorn': eslintPluginUnicorn,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'quotes': ['error', 'single', { avoidEscape: true }],
      'no-irregular-whitespace': ['error'],
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/prefer-number-properties': 'error',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off', // It's fine
      '@typescript-eslint/explicit-module-boundary-types': 'off', // It's fine
      '@typescript-eslint/interface-name-prefix': 'off', // It's fine
      '@typescript-eslint/no-empty-function': 'off', // It's fine
      '@typescript-eslint/no-explicit-any': 'off', // It's fine
      '@typescript-eslint/no-inferrable-types': 'off', // It's fine
      '@typescript-eslint/no-shadow': ['error'],
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'consistent-this': ['error', 'self'],
      'nonblock-statement-body-position': 'error',
      'no-debugger': 'error',
      'no-console': ['warn'],
      'no-param-reassign': 'off',
      'no-prototype-builtins': 'warn',
      // superceeded by @typescript-eslint/no-shadow
      'no-shadow': 'off',
      'no-unused-vars': 'off',
      'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
      'semi': ['error', 'always'],
      'jsx-quotes': [1, 'prefer-double'],
      'simple-import-sort/imports': 'error',
      'no-undef': 'off',
    },
  },
  globalIgnores([
    '**/.eslintrc.js',
    '**/.git',
    '**/node_modules',
    '**/*.min.*',
    '**/*.d.ts',
    '**/CHANGELOG.md',
    '**/dist',
    '**/LICENSE*',
    '**/output',
    '**/coverage',
    '**/temp',
    '**/tmp',
    '**/build',
    '**/dist',
    'public/assets',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
    '**/package-lock.json',
    '**/__snapshots__',
    '**/assets',
  ]),
]);
