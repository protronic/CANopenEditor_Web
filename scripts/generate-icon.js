#!/usr/bin/env node

/**
 * Generates the application icons from assets/icons/icon.svg.
 *
 * Output (all in assets/icons/):
 *   32x32.png, 64x64.png, 128x128.png, 256x256.png, 512x512.png
 *     Size-named PNG set. electron-builder picks these up when `linux.icon`
 *     points to the assets/icons directory (deb hicolor entries, AppImage
 *     .DirIcon/embedded icon).
 *   icon.png
 *     512x512 master PNG used for win.icon (via CI-generated .ico) and mac.icon.
 *
 * Rasterizer: tries inkscape, then rsvg-convert, then ImageMagick.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const iconDir = path.join(__dirname, '..', 'assets', 'icons');
const svgPath = path.join(iconDir, 'icon.svg');
const SIZES = [32, 64, 128, 256, 512];

function renderWithInkscape(size, outPath) {
  execFileSync('inkscape', [
    svgPath,
    '--export-type=png',
    `--export-filename=${outPath}`,
    `--export-width=${size}`,
    `--export-height=${size}`
  ], { stdio: 'pipe' });
}

function renderWithRsvg(size, outPath) {
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', outPath, svgPath], { stdio: 'pipe' });
}

function renderWithMagick(size, outPath) {
  const bin = fs.existsSync('/usr/bin/magick') ? 'magick' : 'convert';
  execFileSync(bin, ['-background', 'none', svgPath, '-resize', `${size}x${size}`, '-depth', '8', outPath], { stdio: 'pipe' });
}

function getRenderer() {
  const candidates = [
    ['inkscape', renderWithInkscape],
    ['rsvg-convert', renderWithRsvg],
    ['magick', renderWithMagick]
  ];
  for (const [name, fn] of candidates) {
    try {
      execFileSync(name, ['--version'], { stdio: 'pipe' });
      return { name, fn };
    } catch {
      // not available, try next
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(svgPath)) {
    console.error(`SVG source not found: ${svgPath}`);
    process.exit(1);
  }

  const renderer = getRenderer();
  if (!renderer) {
    console.error('No SVG rasterizer found. Install inkscape, rsvg-convert or ImageMagick.');
    process.exit(1);
  }
  console.log(`Using rasterizer: ${renderer.name}`);

  for (const size of SIZES) {
    const outPath = path.join(iconDir, `${size}x${size}.png`);
    renderer.fn(size, outPath);
    console.log(`  wrote ${path.basename(outPath)}`);
  }

  // Master PNG (512x512) referenced by win/mac icon settings
  const masterPath = path.join(iconDir, 'icon.png');
  fs.copyFileSync(path.join(iconDir, '512x512.png'), masterPath);
  console.log('  wrote icon.png (512x512)');
}

main();
