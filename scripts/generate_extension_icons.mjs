// Generates icon16.png, icon48.png, icon128.png for Chrome Extension Tracker
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createMinimalPng(width, height, colorR, colorG, colorB) {
  // Simple uncompressed valid PNG generator
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdr);
  
  // IDAT (Raw RGB data with 0 filter byte per scanline)
  const scanlineSize = 1 + width * 3;
  const rawData = Buffer.alloc(height * scanlineSize);
  
  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineSize;
    rawData[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      rawData[pixelOffset] = colorR;
      rawData[pixelOffset + 1] = colorG;
      rawData[pixelOffset + 2] = colorB;
    }
  }
  
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  
  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

// Minimal CRC32 implementation
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      let bit = (crc ^ byte) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
      byte >>>= 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

const iconsDir = path.join(process.cwd(), 'chrome-extension', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Brand Orange RGB: 234, 88, 12 (#EA580C)
fs.writeFileSync(path.join(iconsDir, 'icon16.png'), createMinimalPng(16, 16, 234, 88, 12));
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), createMinimalPng(48, 48, 234, 88, 12));
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), createMinimalPng(128, 128, 234, 88, 12));

console.log('[Extension Icons] Generated icon16.png, icon48.png, icon128.png successfully.');
