// Renders the PWA icons (any + maskable 192/512 and the 180px apple-touch-icon) from original SVG artwork.
// Uses Playwright's Chromium so no extra image dependency is needed. Run: npm run icons
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

/** `inset` shrinks the glyph so maskable icons keep it inside the 80% safe zone. */
function svg({ rounded, inset }) {
  const r = rounded ? 112 : 0;
  const s = inset; // glyph scale around the centre
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3a67"/><stop offset="1" stop-color="#0b0d12"/></linearGradient>
    <linearGradient id="arc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4c8dff"/><stop offset="1" stop-color="#7ddc4a"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <path d="M120 330a136 136 0 1 1 272 0" fill="none" stroke="url(#arc)" stroke-width="34" stroke-linecap="round"/>
    <path d="M256 330 330 238" fill="none" stroke="#f4f6fb" stroke-width="30" stroke-linecap="round"/>
    <circle cx="256" cy="330" r="26" fill="#f4f6fb"/>
    <path d="M150 400h212" fill="none" stroke="rgba(244,246,251,.45)" stroke-width="22" stroke-linecap="round"/>
  </g>
</svg>`;
}

const jobs = [
  { file: 'icon-192.png', size: 192, markup: svg({ rounded: true, inset: 1 }), transparent: true },
  { file: 'icon-512.png', size: 512, markup: svg({ rounded: true, inset: 1 }), transparent: true },
  { file: 'icon-maskable-192.png', size: 192, markup: svg({ rounded: false, inset: 0.78 }) },
  { file: 'icon-maskable-512.png', size: 512, markup: svg({ rounded: false, inset: 0.78 }) },
  { file: 'apple-touch-icon.png', size: 180, markup: svg({ rounded: false, inset: 0.9 }) },
];

const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${job.markup.replace('width="512" height="512"', `width="${job.size}" height="${job.size}"`)}</body></html>`,
    );
    const png = await page.screenshot({ omitBackground: !!job.transparent, type: 'png' });
    writeFileSync(join(out, job.file), png);
    await page.close();
    console.log('wrote', job.file);
  }
} finally {
  await browser.close();
}
