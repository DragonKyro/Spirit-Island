import fs from 'node:fs';
import sharp from 'sharp';

const html = fs.readFileSync('./dist/map-preview.html', 'utf8');
// Extract just the <svg>...</svg>
const m = html.match(/<svg[\s\S]*?<\/svg>/);
if (!m) {
  console.error('No svg in preview html');
  process.exit(1);
}
const svg = m[0];
// Ensure svg has width/height attributes for sharp to rasterize at a known size
await sharp(Buffer.from(svg), { density: 130 }).resize(1200, 816).png().toFile('./dist/map-preview.png');
console.log('Wrote ./dist/map-preview.png');
