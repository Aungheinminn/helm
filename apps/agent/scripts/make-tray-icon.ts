// Renders the menu bar sailboat as macOS template PNGs (black + alpha). The
// "Template" filename suffix tells Electron/macOS to recolour it for light and
// dark menu bars. Run: bun apps/agent/scripts/make-tray-icon.ts
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Pt = [number, number];

// Drawn on an 18×18 grid, the standard menu bar icon size.
const SHAPES: Pt[][] = [
  // main sail
  [[9.6, 1.5], [9.6, 11.2], [15.4, 11.2]],
  // jib
  [[8.4, 3.8], [8.4, 11.2], [3.6, 11.2]],
  // hull
  [[1.8, 12.6], [16.2, 12.6], [13.8, 16.2], [4.2, 16.2]],
];
const GRID = 18;
const SUPERSAMPLE = 8;

function inside([x, y]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function render(size: number): Buffer {
  const scale = size / GRID;
  const rows: Buffer[] = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const p: Pt = [
            (px + (sx + 0.5) / SUPERSAMPLE) / scale,
            (py + (sy + 0.5) / SUPERSAMPLE) / scale,
          ];
          if (SHAPES.some((s) => inside(p, s))) covered++;
        }
      }
      row[1 + px * 4 + 3] = Math.round((covered / SUPERSAMPLE ** 2) * 255);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

function png(width: number, height: number, raw: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(Bun.hash.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join(dirname(dirname(fileURLToPath(import.meta.url))), "assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "trayTemplate.png"), render(18));
writeFileSync(join(outDir, "trayTemplate@2x.png"), render(36));
console.log(`wrote tray icons to ${outDir}`);
