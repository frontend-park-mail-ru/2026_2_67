import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import config from '../webpack.config.js';

test('Webpack runs PostCSS and Autoprefixer on CSS assets', async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'vibemarket-postcss-'));
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const fixture = fileURLToPath(new URL('./fixtures/postcss-probe.css', import.meta.url));
  const compiler = webpack({
    ...config,
    mode: 'development',
    entry: fixture,
    plugins: [],
    output: { ...config.output, path: temporaryDirectory, clean: false },
  });
  const stats = await new Promise((resolve, reject) => {
    compiler.run((error, result) => {
      compiler.close((closeError) => {
        if (error || closeError) reject(error || closeError);
        else resolve(result);
      });
    });
  });
  assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
  const css = await readFile(path.join(temporaryDirectory, 'css', 'postcss-probe.css'), 'utf8');
  assert.match(css, /-webkit-user-select:\s*none/);
  assert.match(css, /(?:^|[;{\s])user-select:\s*none/);
});
