import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'postman', 'reports'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs', 'commitlint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: { pm: 'readonly', schemas: 'readonly', require: 'readonly' },
    },
  },
];
