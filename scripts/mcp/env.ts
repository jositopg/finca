import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Lee ~/.finca-db.env sin pisar variables que ya vengan del entorno
// (en Vercel, DATABASE_URL y FINCA_MCP_TOKEN llegan por ahí).
export function cargarEnv() {
  const ruta = join(homedir(), '.finca-db.env')
  if (!existsSync(ruta)) return
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const coincidencia = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(linea.trim())
    if (coincidencia && !process.env[coincidencia[1]]) process.env[coincidencia[1]] = coincidencia[2]
  }
}
