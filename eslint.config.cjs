module.exports = [
  {
    files: ['public/js/**/*.js'],

    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',

      globals: {
        window: 'readonly',
        document: 'readonly',
        Handlebars: 'readonly',
        FormData: 'readonly'
      }
    },

    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      semi: ['error', 'always']
    }
  }
];
