module.exports = [
  {
    files: ['public/js/**/*.js', 'scripts/**/*.js'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',

      globals: {
        window: 'readonly',
        document: 'readonly',
        Handlebars: 'readonly',
        FormData: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly'
      }
    },

    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      semi: ['error', 'always']
    }
  }
];
