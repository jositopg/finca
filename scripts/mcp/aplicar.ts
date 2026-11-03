import { Client, types as pgTypes } from 'pg'
import { ConsultaError } from './consultar.ts'
import { intencionDe, planificar, type Orden } from './escribir.ts'
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

async function resultadoDeClave(db: ConsultaSql, clave: string): Promise<Record<string, unknown> | undefined> {
  await db.query(CREAR_TABLA)
  const previa = await db.query('select resultado from agente_escrituras where clave = $1', [clave])
  const guardada = previa.rows[0]?.resultado
  if (guardada && typeof guardada === 'object') return guardada as Record<string, unknown>
  return undefined
}

export async function aplicarEscritura(
  nombre: string,
  args: unknown,
  deps: { foto: Foto; hoy?: Date; db?: ConsultaSql },
): Promise<unknown> {
  const hoy = deps.hoy ?? new Date()
  const { confirmar, clave } = intencionDe(args)
  if (!confirmar) return planificar(nombre, args, deps.foto, hoy).vista

  const correr = async (db: ConsultaSql) => {
    // La clave se mira antes de planificar: si el gasto ya se escribió, la
    // factura está en la foto y el duplicado no debe tapar la respuesta repetida.
    if (clave) {
      const ya = await resultadoDeClave(db, clave)
      if (ya) return { ...ya, repetida: true }
    }
    return ejecutarOrden(db, planificar(nombre, args, deps.foto, hoy))
  }
  if (deps.db) return correr(deps.db)
  const cliente = await abrir()
  try {
    return await correr(cliente)
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
