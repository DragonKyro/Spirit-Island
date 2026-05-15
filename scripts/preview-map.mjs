// Render the board layout to a static HTML file so the polygons can be
// inspected without running the full React app. Usage: `node scripts/preview-map.mjs`.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('tsx/esm', pathToFileURL('./'));

const { BOARD_LAYOUT, NON_HEX_BRIDGES, TERRAIN_FILL, TERRAIN_STROKE, VIEWBOX } =
  await import('../src/data/boardLayout.ts');
const fs = await import('node:fs');

const lands = BOARD_LAYOUT.map(
  (l) => `
    <path d="${l.path}"
          fill="${TERRAIN_FILL[l.terrain]}"
          stroke="${TERRAIN_STROKE[l.terrain]}"
          stroke-width="1.6" />
    <text x="${l.centerX}" y="${l.centerY - 30}" text-anchor="middle"
          font-size="16" font-weight="700" fill="#fff"
          stroke="#000" stroke-width="0.5">${l.number}</text>
    <text x="${l.centerX}" y="${l.centerY - 14}" text-anchor="middle"
          font-size="10" fill="rgba(255,255,255,0.75)">${l.terrain}</text>`,
).join('');

const bridges = NON_HEX_BRIDGES.map(
  ([a, b]) => `
    <line x1="${BOARD_LAYOUT[a].centerX}" y1="${BOARD_LAYOUT[a].centerY}"
          x2="${BOARD_LAYOUT[b].centerX}" y2="${BOARD_LAYOUT[b].centerY}"
          stroke="#d4a14a" stroke-width="3" stroke-dasharray="3 6"
          stroke-linecap="round" opacity="0.65" />`,
).join('');

const html = `<!doctype html><html><body style="background:#0a1f33;margin:0;padding:20px;">
<svg viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" width="100%"
     xmlns="http://www.w3.org/2000/svg">
  <rect width="${VIEWBOX.width}" height="${VIEWBOX.height}" fill="#1f4566" />
  ${bridges}
  ${lands}
</svg>
</body></html>`;

fs.writeFileSync('./dist/map-preview.html', html);
console.log('Wrote ./dist/map-preview.html');
