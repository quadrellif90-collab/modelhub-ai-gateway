const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const W = 256, H = 256;

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

// pixel: sfondo scuro arrotondato + "M" stilizzata con gradiente blu
const raw = Buffer.alloc(H * (1 + W * 4));
const R = 48;
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0;
  for (let x = 0; x < W; x++) {
    const idx = rowStart + 1 + x * 4;
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
    const inside = (cx >= 0 && cy >= 0) && (cx * cx + cy * cy <= R * R || (x > 24 && x < W - 24 && y > 24 && y < H - 24));
    // forma arrotondata: corner circle + cross
    const inCornerZone = (cx < R && cy < R);
    const solid = inCornerZone ? ((R - cx) * (R - cx) + (R - cy) * (R - cy) <= R * R)
      : (x >= R - 1 && x <= W - R && y >= 0 || true) && (y >= R - 1 && y <= H - R || !inCornerZone);
    let px = 0, pg = 0, pb = 0, pa = 255;
    const bg = inCornerZone ? ((R - cx) ** 2 + (R - cy) ** 2 <= R * R)
      : (x >= Math.min(cx, R) && x < W - Math.min(cx, R)) && true;
    // semplice: dentro se non in zona angolo, oppure dentro il quarto di cerchio
    const inRect = !(x < R && y < R) && !(x >= W - R && y < R) && !(x < R && y >= H - R) && !(x >= W - R && y >= H - R);
    const inCircleCorner = (x < R && y < R && ((R - x) ** 2 + (R - y) ** 2 <= R * R))
      || (x >= W - R && y < R && ((x - (W - R - 1)) ** 2 + (R - y) ** 2 <= R * R))
      || (x < R && y >= H - R && ((R - x) ** 2 + (y - (H - R - 1)) ** 2 <= R * R))
      || (x >= W - R && y >= H - R && ((x - (W - R - 1)) ** 2 + (y - (H - R - 1)) ** 2 <= R * R));
    const alpha = (inRect || inCircleCorner) ? 255 : 0;
    if (alpha) {
      const t = y / H;
      px = Math.round(20 + 30 * t);
      pg = Math.round(60 + 60 * t);
      pb = Math.round(160 + 80 * t);
      // lettera M: due montanti + diagonali
      const mx = x - 64, mw = 128, my = y - 72, mh = 112;
      const bar = 18;
      const leftBar = mx >= 0 && mx < bar && my >= 0 && my < mh;
      const rightBar = mx >= mw - bar && mx < mw && my >= 0 && my < mh;
      const diagL = my >= 0 && my < mh / 2 && Math.abs(mx - (bar + (mw / 2 - bar) * (my / (mh / 2)))) < bar / 1.6;
      const diagR = my >= 0 && my < mh / 2 && Math.abs((mw - bar) - mx - (mw / 2 - bar) * (my / (mh / 2))) < bar / 1.6;
      if (leftBar || rightBar || diagL || diagR) { px = 255; pg = 255; pb = 255; }
    }
    raw[idx] = px; raw[idx + 1] = pg; raw[idx + 2] = pb; raw[idx + 3] = alpha;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

const out = path.join(__dirname, "..", "icon.png");
fs.writeFileSync(out, png);
console.log("icon written:", out, png.length, "bytes");
