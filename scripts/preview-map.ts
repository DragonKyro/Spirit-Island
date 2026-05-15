// Render the board layout to a static HTML file matching the in-app SVG.
import fs from 'node:fs';
import {
  BOARD_LAYOUT,
  OCEAN_PATH,
  TERRAIN_FILL,
  TERRAIN_STROKE,
  VIEWBOX,
} from '../src/data/boardLayout';
import { createSoloBoard, populateBoard } from '../src/engine/land';
import { createLightning } from '../src/engine/spirit';

const lands = createSoloBoard();
populateBoard(lands);
const spirit = createLightning();
for (const idx of spirit.startingPresenceLands) {
  lands[idx].presence[spirit.name] = (lands[idx].presence[spirit.name] ?? 0) + 1;
}

const landsSvg = BOARD_LAYOUT.map((l) => {
  const land = lands[l.index];
  const e = land.invaders.filter((i) => i.type === 'EXPLORER').length;
  const t = land.invaders.filter((i) => i.type === 'TOWN').length;
  const c = land.invaders.filter((i) => i.type === 'CITY').length;
  const d = land.dahan.length;
  const bl = land.blight;
  const pres = land.presence[spirit.name] ?? 0;
  const counts = [
    e > 0 ? `${e}E` : null,
    t > 0 ? `${t}T` : null,
    c > 0 ? `${c}C` : null,
    d > 0 ? `${d}D` : null,
    bl > 0 ? `${bl}B` : null,
    pres > 0 ? `${pres}P` : null,
  ].filter(Boolean).join(' ');
  return `
    <path d="${l.path}"
          fill="${TERRAIN_FILL[l.terrain]}"
          stroke="${TERRAIN_STROKE[l.terrain]}"
          stroke-width="1.6" />
    <text x="${l.centerX}" y="${l.centerY - 16}" text-anchor="middle"
          font-size="22" font-weight="700" fill="#fff"
          stroke="#000" stroke-width="0.5">${l.number}</text>
    <text x="${l.centerX}" y="${l.centerY + 2}" text-anchor="middle"
          font-size="11" fill="rgba(255,255,255,0.78)">${l.terrain}</text>
    <text x="${l.centerX}" y="${l.centerY + 22}" text-anchor="middle"
          font-size="13" fill="#fff" font-weight="600">${counts}</text>`;
}).join('');

const html = `<!doctype html><html><body style="background:#0a1f33;margin:0;padding:20px;">
<svg viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" width="100%"
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ocean-grad" cx="20%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#3a78a0"/>
      <stop offset="100%" stop-color="#0a1f33"/>
    </radialGradient>
    <linearGradient id="cliff-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a221c"/>
      <stop offset="100%" stop-color="#1a1410"/>
    </linearGradient>
    <pattern id="ocean-waves" x="0" y="0" width="60" height="20" patternUnits="userSpaceOnUse">
      <path d="M 0 10 Q 15 4 30 10 T 60 10" fill="none" stroke="rgba(180,210,230,0.18)" stroke-width="0.9"/>
      <path d="M 0 16 Q 15 10 30 16 T 60 16" fill="none" stroke="rgba(180,210,230,0.12)" stroke-width="0.8"/>
    </pattern>
  </defs>
  <rect width="${VIEWBOX.width}" height="${VIEWBOX.height}" fill="url(#cliff-grad)" />
  <path d="${OCEAN_PATH}" fill="url(#ocean-grad)" />
  <path d="${OCEAN_PATH}" fill="url(#ocean-waves)" />
  ${landsSvg}
</svg>
</body></html>`;

if (!fs.existsSync('./dist')) fs.mkdirSync('./dist');
fs.writeFileSync('./dist/map-preview.html', html);
console.log('Wrote ./dist/map-preview.html');
