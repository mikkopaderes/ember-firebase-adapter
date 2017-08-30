module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
    ecmaFeatures: {
      'experimentalObjectRestSpread': true,
    },
  },
  extends: ['eslint:recommended', 'google'],
  env: {
    browser: true,
    es6: true,
  },
  rules: {
    // -------------------------------------------
    // Google config overrides due to Ember issues
    // -------------------------------------------

    // Causes errors in tests due to this being thrown around
    'no-invalid-this': 'off',

    // ---------------
    // Personal config
    // ---------------

    'comma-dangle': ['error', {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports:'always-multiline',
      functions: 'always-multiline',
    }],
    'linebreak-style': 'off',
    'max-len': ['error', {
      code: 80,
      tabWidth: 2,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
    }],
    'object-curly-spacing': ['error', 'always'],
    'arrow-body-style': ['error', 'always'],
    'prefer-const': 'error',
    'no-console': ['error', { allow: ['warn'] }],
  },
};
