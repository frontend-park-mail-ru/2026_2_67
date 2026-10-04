import { mkdir, copyFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const handlebars = new URL('public/vendor/handlebars/', root);
const fonts = new URL('public/vendor/inter/', root);
await mkdir(handlebars, { recursive: true });
await mkdir(fonts, { recursive: true });
await copyFile(new URL('node_modules/handlebars/dist/handlebars.min.js', root), new URL('handlebars.min.js', handlebars));
await copyFile(new URL('node_modules/handlebars/LICENSE', root), new URL('LICENSE', handlebars));
await copyFile(new URL('node_modules/@fontsource/inter/LICENSE', root), new URL('LICENSE', fonts));

const rules = [];
for (const weight of [400, 500, 600, 700, 800]) {
  for (const subset of ['cyrillic', 'latin']) {
    const file = `inter-${subset}-${weight}-normal.woff2`;
    await copyFile(new URL(`node_modules/@fontsource/inter/files/${file}`, root), new URL(file, fonts));
    const range = subset === 'cyrillic' ? 'U+0400-04FF,U+2116' : 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF,U+FEFF,U+FFFD';
    rules.push(`@font-face { font-family: 'Inter'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url('./${file}') format('woff2'); unicode-range: ${range}; }`);
  }
}
await writeFile(new URL('fonts.css', fonts), rules.join('\n') + '\n');
