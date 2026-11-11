#!/usr/bin/env node

/**
 * Generate a simple ICO file for Windows
 * Creates a 256x256 icon in ICO format
 * Uses pure Node.js without external dependencies
 */

const fs = require('fs');
const path = require('path');

// ICO file format helper
const createIco = (pngData, width, height) => {
  // ICO header (6 bytes)
  const header = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  
  // Icon directory entry (16 bytes)
  const entry = Buffer.alloc(16);
  entry[0] = width;        // Width
  entry[1] = height;       // Height
  entry[2] = 0;            // Color count (0 = 256+ colors)
  entry[3] = 0;            // Reserved
  entry[4] = 0;            // Color planes
  entry[5] = 32;           // Bit depth (32 bits per pixel)
  
  // Calculate data size
  const dataSize = pngData.length;
  entry.writeUInt32LE(dataSize, 6);  // Size of icon data
  entry.writeUInt32LE(22, 10);       // Offset to icon data (6 + 16 = 22)
  
  // Combine: header + entry + PNG data
  return Buffer.concat([header, entry, pngData]);
};

// Create the ICO file
const iconDir = path.join(__dirname, '..', 'assets', 'icons');
const iconPngPath = path.join(iconDir, 'icon.png');
const iconIcoPath = path.join(iconDir, 'icon.ico');

if (!fs.existsSync(iconPngPath)) {
  console.error('✗ icon.png not found. Run generate-proper-icon.js first.');
  process.exit(1);
}

const pngData = fs.readFileSync(iconPngPath);
const icoData = createIco(pngData, 256, 256);

fs.writeFileSync(iconIcoPath, icoData);
console.log('✓ Created icon.ico (Windows icon format)');
console.log(`  Location: ${iconIcoPath}`);
console.log(`  Size: ${icoData.length} bytes`);
