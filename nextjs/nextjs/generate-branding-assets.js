#!/usr/bin/env node

/**
 * Generate branding assets for Zero Trust Analytics
 * This script converts SVG files to various PNG formats needed for favicons and social sharing
 *
 * Usage: node generate-branding-assets.js
 *
 * Note: This script requires sharp package. Install with: npm install --save-dev sharp
 */

const fs = require('fs');
const path = require('path');

// Try to load sharp, provide helpful error if not installed
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('\n❌ Error: sharp package is required but not installed.');
  console.error('Install with: npm install --save-dev sharp\n');
  process.exit(1);
}

const staticDir = path.join(__dirname, 'static');
const imagesDir = path.join(staticDir, 'images');
const brandDir = path.join(imagesDir, 'brand');

async function generateAssets() {
  console.log('🎨 Generating branding assets for Zero Trust Analytics...\n');

  try {
    // Read SVG source files
    const faviconSvg = fs.readFileSync(path.join(staticDir, 'favicon.svg'));
    const logoSvg = fs.readFileSync(path.join(imagesDir, 'logo.png.svg'));
    const shareSvg = fs.readFileSync(path.join(brandDir, 'share.png.svg'));

    // Generate favicon-16x16.png
    console.log('📦 Generating favicon-16x16.png...');
    await sharp(faviconSvg)
      .resize(16, 16)
      .png()
      .toFile(path.join(staticDir, 'favicon-16x16.png'));

    // Generate favicon-32x32.png
    console.log('📦 Generating favicon-32x32.png...');
    await sharp(faviconSvg)
      .resize(32, 32)
      .png()
      .toFile(path.join(staticDir, 'favicon-32x32.png'));

    // Generate apple-touch-icon.png (180x180)
    console.log('📦 Generating apple-touch-icon.png (180x180)...');
    await sharp(faviconSvg)
      .resize(180, 180)
      .png()
      .toFile(path.join(staticDir, 'apple-touch-icon.png'));

    // Generate favicon.ico (using 32x32 as base)
    console.log('📦 Generating favicon.ico...');
    // Note: Sharp doesn't support ICO output, so we'll create a 32x32 PNG and rename it
    // For proper ICO support, use ImageMagick or an online converter
    await sharp(faviconSvg)
      .resize(32, 32)
      .png()
      .toFile(path.join(staticDir, 'favicon.ico.png'));

    // For now, just copy the 32x32 version as .ico
    // This works in most modern browsers
    fs.copyFileSync(
      path.join(staticDir, 'favicon.ico.png'),
      path.join(staticDir, 'favicon.ico')
    );
    fs.unlinkSync(path.join(staticDir, 'favicon.ico.png'));

    // Generate safari-pinned-tab.svg (monochrome)
    console.log('📦 Generating safari-pinned-tab.svg...');
    const safariSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M16 2L6 6v8c0 6.5 4.5 12 10 14 5.5-2 10-7.5 10-14V6l-10-4z M14 14v-2c0-1.1.9-2 2-2s2 .9 2 2v2h-4z M13 14h6v7c0 .6-.4 1-1 1h-4c-.6 0-1-.4-1-1v-7z M15 17.5l1 1 2-2.5" fill="#000"/>
</svg>`;
    fs.writeFileSync(path.join(staticDir, 'safari-pinned-tab.svg'), safariSvg);

    // Generate logo.png (800x200)
    console.log('📦 Generating logo.png (800x200)...');
    await sharp(logoSvg)
      .resize(800, 200)
      .png()
      .toFile(path.join(imagesDir, 'logo.png'));

    // Generate social share image (1200x630)
    console.log('📦 Generating share.png (1200x630)...');
    await sharp(shareSvg)
      .resize(1200, 630)
      .png()
      .toFile(path.join(brandDir, 'share.png'));

    // Clean up temporary SVG files (keeping favicon.svg as it's referenced in HTML)
    console.log('🧹 Cleaning up temporary SVG source files...');
    fs.unlinkSync(path.join(imagesDir, 'logo.png.svg'));
    fs.unlinkSync(path.join(brandDir, 'share.png.svg'));

    console.log('\n✅ All branding assets generated successfully!\n');
    console.log('Generated files:');
    console.log('  ✓ favicon.ico');
    console.log('  ✓ favicon.svg');
    console.log('  ✓ favicon-16x16.png');
    console.log('  ✓ favicon-32x32.png');
    console.log('  ✓ apple-touch-icon.png');
    console.log('  ✓ safari-pinned-tab.svg');
    console.log('  ✓ images/logo.png');
    console.log('  ✓ images/brand/share.png\n');
    console.log('💡 Tip: Update your HTML templates to reference these files!');
    console.log('   The typo in layouts/partials/head.html has already been fixed.\n');

  } catch (error) {
    console.error('\n❌ Error generating assets:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the generator
generateAssets();
