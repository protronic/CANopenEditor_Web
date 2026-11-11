#!/usr/bin/env node

/**
 * Generate a simple but proper PNG icon for Electron
 * Creates a 256x256 blue square with white "CE" text
 * Uses pure Node.js without external dependencies
 */

const fs = require('fs');
const path = require('path');

// PNG file structure
const createPng = (width, height) => {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;   // Bit depth
  ihdrData[9] = 2;   // Color type: RGB
  ihdrData[10] = 0;  // Compression
  ihdrData[11] = 0;  // Filter
  ihdrData[12] = 0;  // Interlace
  
  const ihdr = createChunk('IHDR', ihdrData);
  
  // Create image data (blue background with white text)
  const rowSize = width * 3 + 1; // 3 bytes per pixel + filter byte
  const imageData = Buffer.alloc(height * rowSize, 0);
  
  // Fill with Angular blue (#2962FF -> RGB: 41, 98, 255)
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    // Filter byte (0 = no filter)
    imageData[rowStart] = 0;
    
    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      imageData[pixelStart] = 41;      // R
      imageData[pixelStart + 1] = 98;  // G
      imageData[pixelStart + 2] = 255; // B
    }
  }
  
  // Draw a white rectangle in the center for text background
  const rectX = Math.floor(width * 0.3);
  const rectY = Math.floor(height * 0.3);
  const rectW = Math.floor(width * 0.4);
  const rectH = Math.floor(height * 0.4);
  
  for (let y = rectY; y < rectY + rectH && y < height; y++) {
    for (let x = rectX; x < rectX + rectW && x < width; x++) {
      const pixelStart = y * rowSize + 1 + x * 3;
      imageData[pixelStart] = 255;      // R
      imageData[pixelStart + 1] = 255;  // G
      imageData[pixelStart + 2] = 255; // B
    }
  }
  
  // Simple "CE" text (pixel art style)
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  
  // Draw "C"
  for (let dy = -20; dy <= 20; dy++) {
    for (let dx = -20; dx <= 20; dx++) {
      const px = centerX - 40 + dx;
      const py = centerY + dy;
      if (px >= 0 && px < width && py >= 0 && py < height) {
        // Check if we're on the "C" shape
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (radius >= 15 && radius <= 25 && dx >= -10) {
          const pixelStart = py * rowSize + 1 + px * 3;
          imageData[pixelStart] = 41;      // R
          imageData[pixelStart + 1] = 98;  // G
          imageData[pixelStart + 2] = 255; // B
        }
      }
    }
  }
  
  // Draw "E"
  for (let dy = -20; dy <= 20; dy++) {
    for (let dx = -20; dx <= 20; dx++) {
      const px = centerX + 20 + dx;
      const py = centerY + dy;
      if (px >= 0 && px < width && py >= 0 && py < height) {
        // Check if we're on the "E" shape
        if ((dx >= -20 && dx <= -5) || (dy >= -5 && dy <= 5)) {
          const pixelStart = py * rowSize + 1 + px * 3;
          imageData[pixelStart] = 41;      // R
          imageData[pixelStart + 1] = 98;  // G
          imageData[pixelStart + 2] = 255; // B
        }
      }
    }
  }
  
  const idat = createChunk('IDAT', imageData);
  const iend = createChunk('IEND', Buffer.from([]));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
};

const createChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuf = Buffer.from(type, 'ascii');
  
  // Calculate CRC32
  const crc = calculateCrc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuf, data, crcBuf]);
};

// Simple CRC32 implementation
const calculateCrc32 = (data) => {
  let crc = 0xFFFFFFFF;
  const table = makeCrcTable();
  
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const makeCrcTable = () => {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
};

// Create the icon
const iconDir = path.join(__dirname, '..', 'assets', 'icons');
const iconPath = path.join(iconDir, 'icon.png');

if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

const pngData = createPng(256, 256);
fs.writeFileSync(iconPath, pngData);
console.log('✓ Created proper icon.png (256x256 with CE logo)');
console.log(`  Location: ${iconPath}`);
console.log(`  Size: ${pngData.length} bytes`);
