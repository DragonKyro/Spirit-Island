// Render PDF pages to PNG via node-poppler (uses its own bundled binaries).
import fs from 'node:fs';
import path from 'node:path';
import { Poppler } from 'node-poppler';

const PDF_PATH = './Spirit Island Rules.pdf';
const OUT_DIR = './dist/rules-pages';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const poppler = new Poppler();
// Convert all pages of the PDF to PNG at 150 DPI.
const outBase = path.join(OUT_DIR, 'page');
await poppler.pdfToCairo(PDF_PATH, outBase, {
  pngFile: true,
  resolutionXAxis: 150,
  resolutionYAxis: 150,
});
console.log('Pages written to', OUT_DIR);
const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png'));
console.log(files.sort());
