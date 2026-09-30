const { defineConfig } = require('vite');

module.exports = defineConfig({
  root: 'public',
  publicDir: '.',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
