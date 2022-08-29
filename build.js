import esbuild from 'esbuild'

esbuild.buildSync({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/algorand.js',
    format: 'cjs',
    bundle: true,
    platform: "node"
})
