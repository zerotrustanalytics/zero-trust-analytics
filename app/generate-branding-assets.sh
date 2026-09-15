#!/bin/bash
# Generate branding assets for Zero Trust Analytics
# This script converts SVG files to various PNG formats needed for favicons and social sharing

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
STATIC_DIR="$SCRIPT_DIR/static"

echo "Generating branding assets for Zero Trust Analytics..."

# Check for required tools
if ! command -v convert &> /dev/null && ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick is required but not installed."
    echo "Install with: brew install imagemagick"
    exit 1
fi

# Use 'magick' command if available (ImageMagick 7+), otherwise 'convert' (ImageMagick 6)
if command -v magick &> /dev/null; then
    CONVERT="magick"
else
    CONVERT="convert"
fi

# Generate favicon sizes from favicon.svg
echo "Generating favicon-16x16.png..."
$CONVERT -background none -resize 16x16 "$STATIC_DIR/favicon.svg" "$STATIC_DIR/favicon-16x16.png"

echo "Generating favicon-32x32.png..."
$CONVERT -background none -resize 32x32 "$STATIC_DIR/favicon.svg" "$STATIC_DIR/favicon-32x32.png"

echo "Generating apple-touch-icon.png (180x180)..."
$CONVERT -background none -resize 180x180 "$STATIC_DIR/favicon.svg" "$STATIC_DIR/apple-touch-icon.png"

echo "Generating favicon.ico (multi-size)..."
$CONVERT -background none "$STATIC_DIR/favicon.svg" \
  -resize 16x16 -define icon:auto-resize=16,32,48,64,256 \
  "$STATIC_DIR/favicon.ico"

echo "Generating safari-pinned-tab.svg (monochrome)..."
# Create a monochrome version for Safari pinned tabs
cat > "$STATIC_DIR/safari-pinned-tab.svg" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M16 2L6 6v8c0 6.5 4.5 12 10 14 5.5-2 10-7.5 10-14V6l-10-4z M14 14v-2c0-1.1.9-2 2-2s2 .9 2 2v2h-4z M13 14h6v7c0 .6-.4 1-1 1h-4c-.6 0-1-.4-1-1v-7z M15 17.5l1 1 2-2.5" fill="#000"/>
</svg>
EOF

# Generate logo.png from logo.png.svg
echo "Generating logo.png (800x200)..."
$CONVERT -background none -resize 800x200 "$STATIC_DIR/images/logo.png.svg" "$STATIC_DIR/images/logo.png"

# Generate social share image from share.png.svg
echo "Generating share.png (1200x630)..."
$CONVERT -background "#f8fafc" "$STATIC_DIR/images/brand/share.png.svg" "$STATIC_DIR/images/brand/share.png"

# Clean up temporary SVG files (keeping favicon.svg as it's referenced in HTML)
echo "Cleaning up temporary SVG source files..."
rm -f "$STATIC_DIR/images/logo.png.svg"
rm -f "$STATIC_DIR/images/brand/share.png.svg"

echo ""
echo "✓ All branding assets generated successfully!"
echo ""
echo "Generated files:"
echo "  - $STATIC_DIR/favicon.ico"
echo "  - $STATIC_DIR/favicon.svg"
echo "  - $STATIC_DIR/favicon-16x16.png"
echo "  - $STATIC_DIR/favicon-32x32.png"
echo "  - $STATIC_DIR/apple-touch-icon.png"
echo "  - $STATIC_DIR/safari-pinned-tab.svg"
echo "  - $STATIC_DIR/images/logo.png"
echo "  - $STATIC_DIR/images/brand/share.png"
echo ""
echo "Remember to update your HTML templates to reference these files!"
