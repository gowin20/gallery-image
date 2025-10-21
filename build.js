import esbuild from 'esbuild';

await esbuild.build({
    entryPoints: ['./src/gallery-image.ts'],
    bundle: true,
    platform:'node',
    format:'cjs',
    outfile: './dist/out.js'
});