/**
 * Vẽ biểu tượng PWA + favicon.svg cho ứng dụng rồi ghi vào public/.
 * Chạy lại khi đổi màu thương hiệu: node tools/make_icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'public', 'icons');

const NAVY = '#0F2A5F';
const BLUE = '#2563EB';
const WHITE = '#FFFFFF';
const GRID = '#BFCFE6';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Icon app: nền xanh navy, thẻ lịch trắng, dải tiêu đề xanh, 1 ô ngày được chọn. */
function drawIcon(size, { maskable }) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = NAVY;
  if (maskable) {
    ctx.fillRect(0, 0, size, size);
  } else {
    roundRect(ctx, 0, 0, size, size, size * 0.22);
    ctx.fill();
  }

  // Mặt nạ icon phải chừa vùng an toàn, nên thẻ lịch nhỏ hơn bản thường.
  const share = maskable ? 0.58 : 0.70;
  const w = size * share;
  const h = size * share;
  const x = (size - w) / 2;
  const y = (size - h) / 2 + size * 0.02;
  const band = h * 0.24;

  ctx.fillStyle = WHITE;
  roundRect(ctx, x, y, w, h, w * 0.1);
  ctx.fill();

  ctx.save();
  roundRect(ctx, x, y, w, h, w * 0.1);
  ctx.clip();
  ctx.fillStyle = BLUE;
  ctx.fillRect(x, y, w, band);
  ctx.restore();

  ctx.strokeStyle = WHITE;
  ctx.lineWidth = w * 0.045;
  ctx.lineCap = 'round';
  for (const px of [x + w * 0.28, x + w * 0.72]) {
    ctx.beginPath();
    ctx.moveTo(px, y - h * 0.05);
    ctx.lineTo(px, y + band * 0.5);
    ctx.stroke();
  }

  const cols = 4;
  const rows = 3;
  const padX = w * 0.1;
  const padTop = band + h * 0.09;
  const padBottom = h * 0.09;
  const cellW = (w - padX * 2) / cols;
  const cellH = (h - padTop - padBottom) / rows;
  const dotW = cellW * 0.66;
  const dotH = cellH * 0.6;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const chosen = r === 1 && c === 2;
      ctx.fillStyle = chosen ? BLUE : GRID;
      const dx = x + padX + c * cellW + (cellW - dotW) / 2;
      const dy = y + padTop + r * cellH + (cellH - dotH) / 2;
      roundRect(ctx, dx, dy, dotW, dotH, dotW * 0.28);
      ctx.fill();
    }
  }

  return canvas.toBuffer('image/png');
}

function faviconSvg() {
  const s = 64;
  const cols = 4;
  const rows = 3;
  const card = { x: 8, y: 12, w: 48, h: 44 };
  const band = card.h * 0.24;
  const padX = card.w * 0.1;
  const cellW = (card.w - padX * 2) / cols;
  const cellH = (card.h - band - card.h * 0.18) / rows;
  let dots = '';
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const chosen = r === 1 && c === 2;
      const dx = card.x + padX + c * cellW + cellW * 0.17;
      const dy = card.y + band + card.h * 0.09 + r * cellH + cellH * 0.2;
      dots += `<rect x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" width="${(cellW * 0.66).toFixed(1)}" height="${(cellH * 0.6).toFixed(1)}" rx="1.2" fill="${chosen ? BLUE : GRID}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
<rect x="0" y="0" width="${s}" height="${s}" rx="14" fill="${NAVY}"/>
<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="5" fill="${WHITE}"/>
<path d="M${card.x} ${card.y + 5} a5 5 0 0 1 5 -5 h38 a5 5 0 0 1 5 5 v${band - 5} h-48 z" fill="${BLUE}"/>
<path d="M21 9 v8 M43 9 v8" stroke="${WHITE}" stroke-width="3" stroke-linecap="round"/>
${dots}
</svg>
`;
}

fs.mkdirSync(ICON_DIR, { recursive: true });
const outputs = [
  ['icon-192.png', drawIcon(192, { maskable: false })],
  ['icon-512.png', drawIcon(512, { maskable: false })],
  ['icon-maskable-512.png', drawIcon(512, { maskable: true })],
  ['apple-touch-icon.png', drawIcon(180, { maskable: false })],
];
for (const [name, buffer] of outputs) {
  fs.writeFileSync(path.join(ICON_DIR, name), buffer);
  console.log(`public/icons/${name} · ${buffer.length} bytes`);
}
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), faviconSvg());
console.log('public/favicon.svg');
