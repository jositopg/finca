import { Client, types as pgTypes } from 'pg'
import { ConsultaError } from './consultar.ts'
import { planificar, type Orden } from './escribir.ts'
import { cargarEnv } from './env.ts'
import type { Foto } from './foto.ts'

pgTypes.setTypeParser(1082, (valor) => valor)
pgTypes.setTypeParser(1114, (valor) => valor)
pgTypes.setTypeParser(1184, (valor) => valor)

export interface ConsultaSql {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
}

const CREAR_TABLA = `create table if not exists agente_escrituras (
  clave text primary key,
  herramienta text not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
)`

async function abrir(): Promise<Client> {
  cargarEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL en ~/.finca-db.env')
  const cliente = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await cliente.connect()
  return cliente
}

export async function aplicarEscritura(
  nombre: string,
  args: unknown,
  deps: { foto: Foto; hoy?: Date; db?: ConsultaSql },
): Promise<unknown> {
  const orden = planificar(nombre, args, deps.foto, deps.hoy ?? new Date())
  if (!orden.confirmar) return orden.vista
  if (deps.db) return ejecutarOrden(deps.db, orden)
  const cliente = await abrir()
  try {
    return await ejecutarOrden(cliente, orden)
  } finally {
    await cliente.end()
  }
}

async function ejecutarOrden(db: ConsultaSql, orden: Orden): Promise<unknown> {
  if (!orden.clave) throw new ConsultaError('Para escribir hace falta "clave".')
  await db.query('begin')
  try {
    await db.query(CREAR_TABLA)
    const previa = await db.query('select resultado from agente_escrituras where clave = $1', [orden.clave])
    const guardada = previa.rows[0]?.resultado
    if (guardada && typeof guardada === 'object') {
      await db.query('commit')
      return { ...(guardada as Record<string, unknown>), repetida: true }
    }
    for (const sentencia of orden.sentencias) {
      const hecha = await db.query(sentencia.sql, sentencia.params)
      if (orden.herramienta === 'cerrar_tarea' && (hecha.rowCount ?? 0) === 0) {
        throw new ConsultaError('Esa tarea ya no está pendiente.')
      }
    }
    await db.query('insert into agente_escrituras (clave, herramienta, resultado) values ($1, $2, $3::jsonb)', [
      orden.clave,
      orden.herramienta,
      JSON.stringify(orden.resultado),
    ])
    await db.query('commit')
    return orden.resultado
  } catch (err) {
    await db.query('rollback')
    throw err
  }
}
