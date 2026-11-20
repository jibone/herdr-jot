import js from '@eslint/js';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';

const JOT = 'mods/jot';
const FORK = 'mods/tabs-jot';
// Each mod's View: the one class allowed anywhere, its method count bounded.
const VIEWS = [`${JOT}/main.js`, `${FORK}/main.js`];
const SOURCES = ['**/*.js', '**/*.mjs'];
const TESTS = ['test/**', '**/test/**'];
const NODE = ['tools/**', 'eslint.config.js', ...TESTS];
const MAX_VIEW_METHODS = 12;

// The host gives mods a little more than the language: localStorage, where
// the shipped tabs mod (and so the fork) keeps per-space memory.
const HOST_GLOBALS = { localStorage: 'readonly' };

const banned = (selector, message) => ({ selector, message });
const NO_CLASSES = [
  banned('ClassDeclaration', 'functions, not classes: the one class is the View in each main.js'),
  banned('ClassExpression', 'functions, not classes: the one class is the View in each main.js'),
  banned('ThisExpression', 'no this outside the View: pass what a function needs'),
];
const THIN_VIEW = banned(`ClassBody > MethodDefinition:nth-child(${MAX_VIEW_METHODS + 1})`,
  `the View keeps at most ${MAX_VIEW_METHODS} methods: a bigger one wants a helper file`);

export default [
  { ignores: ['node_modules/**', '**/fixtures/**', '**/*.d.ts', 'docs/**'] },
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' } },
  { files: SOURCES, ...js.configs.recommended },
  {
    files: SOURCES,
    plugins: { sonarjs },
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: HOST_GLOBALS },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-shadow': ['error', { allow: ['cx'] }],
      'no-param-reassign': ['error', { props: false }],
      'no-nested-ternary': 'error',
      'no-else-return': 'error',
      'consistent-return': 'error',
      'no-duplicate-imports': 'error',
      'no-useless-return': 'error',
      'no-useless-concat': 'error',
      'no-lonely-if': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      curly: ['error', 'multi-line'],
      'default-param-last': 'error',
      'no-implicit-coercion': 'error',
      'no-restricted-syntax': ['error', ...NO_CLASSES],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'sonarjs/prefer-immediate-return': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-small-switch': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-identical-conditions': 'error',
    },
  },
  { files: NODE, languageOptions: { ecmaVersion: 'latest', globals: { ...globals.node } } },
  {
    // Size and complexity hold everywhere but the fork and the tests: the
    // fork is Herdr's shipped code kept verbatim, so its shape is theirs.
    files: SOURCES,
    ignores: [...TESTS, `${FORK}/**`],
    rules: {
      'max-lines': ['error', { max: 300 }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true }],
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-params': ['error', 5],
      'max-statements': ['error', 25],
      'max-nested-callbacks': ['error', 3],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  {
    files: TESTS,
    rules: {
      'max-lines': ['error', { max: 600 }],
      'sonarjs/no-duplicate-string': 'off',
    },
  },
  {
    files: VIEWS,
    rules: {
      'max-classes-per-file': ['error', 1],
      'no-restricted-syntax': ['error', THIN_VIEW],
    },
  },
  {
    // The fork (Herdr's shipped tabs mod plus one change set) is frozen:
    // never edit it to satisfy a rule — add the rule here instead. Base and
    // style rules apply; the shape limits above do not, and neither does the
    // identical small callbacks rule that Herdr's own code repeats, its
    // 3x block ids, or the inner `label` params that shadow its label().
    files: [`${FORK}/**`],
    rules: {
      'max-lines-per-function': 'off',
      complexity: 'off',
      'max-statements': 'off',
      'max-depth': 'off',
      'max-nested-callbacks': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'no-shadow': ['error', { allow: ['cx', 'label'] }],
    },
  },
];
