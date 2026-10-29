import { build } from 'vite'

// Vercel no sigue los import .ts del handler. Este paso deja un solo
// api/finca.js, con `pg` fuera para que el runtime de Node lo resuelva.
await build({
  configFile: false,
  plugins: [],
  build: {
    ssr: 'scripts/mcp/funcion.ts',
    outDir: 'api',
    emptyOutDir: false,
    minify: false,
    target: 'node24',
    rollupOptions: {
      external: ['pg'],
      output: {
        format: 'es',
        entryFileNames: 'finca.js',
      },
    },
  },
  logLevel: 'warn',
})
