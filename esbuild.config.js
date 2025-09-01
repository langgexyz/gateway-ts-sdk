import * as esbuild from 'esbuild';

const baseConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  external: ['ws'], // Keep Node.js built-ins as external
  minify: false,
  sourcemap: false,
  treeShaking: true,
};

async function build() {
  try {
    // Build CommonJS version
    await esbuild.build({
      ...baseConfig,
      outfile: 'dist/index.cjs',
      format: 'cjs',
    });

    // Build ESM version  
    await esbuild.build({
      ...baseConfig,
      outfile: 'dist/index.mjs',
      format: 'esm',
    });

    console.log('✅ esbuild completed successfully!');
  } catch (error) {
    console.error('❌ esbuild failed:', error);
    process.exit(1);
  }
}

build();
