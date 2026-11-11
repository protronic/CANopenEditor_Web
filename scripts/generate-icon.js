#!/usr/bin/env node

/**
 * Script to generate a simple PNG icon for Electron
 * This creates a basic blue square with white text
 */

const fs = require('fs');
const path = require('path');

// Create a simple 256x256 PNG programmatically
// This is a very basic PNG file with a blue background
const createPng = () => {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk (256x256, 8-bit RGB)
  const width = 256;
  const height = 256;
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x01, 0x00, // Width: 256
    0x00, 0x00, 0x01, 0x00, // Height: 256
    0x08,                   // Bit depth: 8
    0x02,                   // Color type: RGB
    0x00,                   // Compression: 0
    0x00,                   // Filter: 0
    0x00                    // Interlace: 0
  ]);
  
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk (image data - just blue for now)
  const rowSize = width * 3 + 1; // 3 bytes per pixel + filter byte
  const imageData = Buffer.alloc(height * rowSize, 0x00); // Fill with zeros (black)
  
  // Make it blue (R=41, G=118, B=210 for Angular blue-ish)
  for (let i = 0; i < height * rowSize; i++) {
    const col = (i - 1) % rowSize;
    if (col >= 1 && col <= width * 3) {
      const pixelIndex = Math.floor((col - 1) / 3);
      if (pixelIndex < width) {
        const offset = pixelIndex * 3 + 1;
        if (i + offset < imageData.length) {
          imageData[i + offset] = 41;    // R
          imageData[i + offset + 1] = 118; // G
          imageData[i + offset + 2] = 210; // B
        }
      }
    }
  }
  
  const idat = createChunk('IDAT', imageData);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.from([]));
  
  // Combine all chunks
  return Buffer.concat([signature, ihdr, idat, iend]);
};

const createChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuf = Buffer.from(type, 'ascii');
  
  // CRC32 calculation (simplified - just use a placeholder)
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(0x12345678, 0); // Placeholder CRC
  
  return Buffer.concat([length, typeBuf, data, crc]);
};

// For now, let's just create a simple SVG as the icon
// PNG generation is complex, so we'll use the SVG we already have
const iconDir = path.join(__dirname, '..', 'assets', 'icons');
const iconPath = path.join(iconDir, 'icon.png');

// Check if we can use a better method
try {
  const { execSync } = require('child_process');
  
  // Try to create a PNG from SVG using rsvg-convert if available
  const svgPath = path.join(iconDir, 'icon.svg');
  
  try {
    execSync(`rsvg-convert -w 256 -h 256 ${svgPath} > ${iconPath}`, { cwd: __dirname });
    console.log('✓ Created icon.png from icon.svg using rsvg-convert');
  } catch (e) {
    // If rsvg-convert is not available, create a minimal placeholder
    console.log('! rsvg-convert not available, creating placeholder icon');
    createMinimalPng();
  }
} catch (e) {
  createMinimalPng();
}

function createMinimalPng() {
  // Create a very minimal valid 1x1 PNG
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60,
    0x82
  ]);
  
  fs.writeFileSync(iconPath, minimalPng);
  console.log('✓ Created minimal placeholder icon.png');
}
