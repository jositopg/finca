import { build } from 'vite'

// Vercel no sigue los import .ts del handler. Este paso deja un solo
// api/finca.js, con `pg` fuera para que el runtime de Node lo resuelva.
// El archivo va en el repo: un clon de Git no registra la ruta si la
// función no existe ya entre los archivos del despliegue.
await build({
  configFile: false,
  plugins: [],
  publicDir: false,
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
