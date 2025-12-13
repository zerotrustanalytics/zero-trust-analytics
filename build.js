const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function buildScript(inputFile, outputFile, options = {}) {
  const source = fs.readFileSync(inputFile, 'utf8');

  const minifyOptions = {
    compress: {
      passes: 3,
      pure_getters: true,
      unsafe: true,
      unsafe_comps: true,
      unsafe_Function: true,
      unsafe_math: true,
      unsafe_proto: true,
      unsafe_regexp: true,
      unsafe_undefined: true,
      drop_console: !options.debug,
      drop_debugger: true,
      pure_funcs: options.debug ? [] : ['console.log', 'console.debug', 'console.info']
    },
    mangle: {
      toplevel: true,
      properties: {
        regex: /^_/
      }
    },
    format: {
      comments: false,
      ecma: 5
    },
    ecma: 5
  };

  const result = await minify(source, minifyOptions);

  if (result.error) {
    console.error('Minification error:', result.error);
    process.exit(1);
  }

  fs.writeFileSync(outputFile, result.code, 'utf8');

  const inputSize = fs.statSync(inputFile).size;
  const outputSize = fs.statSync(outputFile).size;
  const ratio = ((1 - outputSize / inputSize) * 100).toFixed(1);

  console.log(`✓ ${path.basename(inputFile)} -> ${path.basename(outputFile)}`);
  console.log(`  Input:  ${(inputSize / 1024).toFixed(2)} KB`);
  console.log(`  Output: ${(outputSize / 1024).toFixed(2)} KB`);
  console.log(`  Saved:  ${ratio}%`);

  // Estimate gzipped size
  const zlib = require('zlib');
  const gzipped = zlib.gzipSync(result.code);
  console.log(`  Gzip:   ${(gzipped.length / 1024).toFixed(2)} KB`);
  console.log('');

  return outputSize;
}

async function build() {
  console.log('Building ZTA Analytics Scripts\n');
  console.log('================================\n');

  const distDir = path.join(__dirname, 'static', 'js');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Build core (minimal) version
  console.log('Core Version (Minimal):');
  await buildScript(
    path.join(__dirname, 'src', 'analytics.core.js'),
    path.join(distDir, 'analytics.min.js')
  );

  // Build full version (with comments stripped)
  console.log('Full Version (All Features):');
  await buildScript(
    path.join(__dirname, 'src', 'analytics.js'),
    path.join(distDir, 'analytics.full.min.js')
  );

  // Build dev version (readable)
  console.log('Development Version:');
  const devSource = fs.readFileSync(path.join(__dirname, 'src', 'analytics.core.js'), 'utf8');
  fs.writeFileSync(
    path.join(distDir, 'analytics.dev.js'),
    devSource,
    'utf8'
  );
  const devSize = fs.statSync(path.join(distDir, 'analytics.dev.js')).size;
  console.log(`✓ analytics.core.js -> analytics.dev.js`);
  console.log(`  Size: ${(devSize / 1024).toFixed(2)} KB (unminified)`);
  console.log('');

  console.log('================================');
  console.log('Build complete!\n');
  console.log('Recommended usage:');
  console.log('  - analytics.min.js (core, <2KB) - For most sites');
  console.log('  - analytics.full.min.js (all features) - For advanced tracking');
  console.log('  - analytics.dev.js (readable) - For development/debugging');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
