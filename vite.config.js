const { cpSync } = require('node:fs');
const { resolve } = require('node:path');
const { defineConfig } = require('vite');

function copyLegacyAssets() {
  return {
    name: 'copy-legacy-assets',
    writeBundle() {
      ['css', 'images', 'js'].forEach((directory) => {
        cpSync(
          resolve(__dirname, 'public', directory),
          resolve(__dirname, 'dist', directory),
          { recursive: true },
        );
      });
    },
  };
}

module.exports = defineConfig({
  root: 'public',
  publicDir: false,
  plugins: [copyLegacyAssets()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
