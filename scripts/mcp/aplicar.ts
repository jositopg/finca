import { Client, types as pgTypes } from 'pg'
import { ConsultaError } from './consultar.ts'
import {
  esCorreccion,
  intencionDe,
  pedidoCorreccion,
  planificar,
  type Orden,
  type PedidoCorreccion,
} from './escribir.ts'
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
  if (esCorreccion(nombre)) return aplicarCorreccion(nombre, args, deps)
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

async function ejecutarOrden(
  db: ConsultaSql,
  orden: Orden,
  completar?: (db: ConsultaSql) => Promise<Orden>,
): Promise<unknown> {
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
    const efectiva = completar ? await completar(db) : orden
    for (const sentencia of efectiva.sentencias) {
      const hecha = await db.query(sentencia.sql, sentencia.params)
      if (efectiva.herramienta === 'cerrar_tarea' && (hecha.rowCount ?? 0) === 0) {
        throw new ConsultaError('Esa tarea ya no está pendiente.')
      }
      if (
        (efectiva.herramienta === 'editar_registro' || efectiva.herramienta === 'borrar_registro') &&
        (hecha.rowCount ?? 0) === 0
      ) {
        throw new ConsultaError('Esa fila ya no existe.')
      }
    }
    await db.query('insert into agente_escrituras (clave, herramienta, resultado) values ($1, $2, $3::jsonb)', [
      orden.clave,
      efectiva.herramienta,
      JSON.stringify(efectiva.resultado),
    ])
    await db.query('commit')
    return efectiva.resultado
  } catch (err) {
    await db.query('rollback')
    throw err
  }
}

const COLUMNAS_BLOQUEADAS = new Set(['id', 'created_at', 'user_id', 'owner'])
const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/

function citar(nombre: string): string {
  if (!IDENTIFICADOR.test(nombre)) throw new ConsultaError(`"${nombre}" no es un nombre válido.`)
  return `"${nombre}"`
}

async function conBase<T>(deps: { db?: ConsultaSql }, correr: (db: ConsultaSql) => Promise<T>): Promise<T> {
  if (deps.db) return correr(deps.db)
  const cliente = await abrir()
  try {
    return await correr(cliente)
  } finally {
    await cliente.end()
  }
}

async function aplicarCorreccion(
  nombre: string,
  args: unknown,
  deps: { db?: ConsultaSql },
): Promise<unknown> {
  const pedido = pedidoCorreccion(nombre, args)
  return conBase(deps, async (db) => {
    if (pedido.confirmar && pedido.clave) {
      const ya = await resultadoDeClave(db, pedido.clave)
      if (ya) return { ...ya, repetida: true }
    }
    if (!pedido.confirmar) return (await ordenDeCorreccion(db, pedido)).vista
    return ejecutarOrden(db, ordenPendiente(pedido), (tx) => ordenDeCorreccion(tx, pedido))
  })
}

function ordenPendiente(pedido: PedidoCorreccion): Orden {
  return {
    herramienta: pedido.herramienta,
    confirmar: true,
    clave: pedido.clave,
    vista: {},
    sentencias: [],
    resultado: {},
  }
}

async function columnasEditables(db: ConsultaSql, tabla: string): Promise<Map<string, string>> {
  const leidas = await db.query(
    `select column_name, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [tabla],
  )
  if (leidas.rows.length === 0) throw new ConsultaError(`No se encuentra la tabla "${tabla}".`)
  const mapa = new Map<string, string>()
  for (const fila of leidas.rows) {
    const columna = typeof fila.column_name === 'string' ? fila.column_name : ''
    if (!IDENTIFICADOR.test(columna) || COLUMNAS_BLOQUEADAS.has(columna)) continue
    mapa.set(columna, typeof fila.udt_name === 'string' ? fila.udt_name : '')
  }
  return mapa
}

function exigirCampos(tabla: string, campos: Record<string, unknown>, columnas: Map<string, string>) {
  for (const columna of Object.keys(campos)) {
    if (COLUMNAS_BLOQUEADAS.has(columna)) throw new ConsultaError(`No se puede cambiar "${columna}".`)
    if (!columnas.has(columna)) throw new ConsultaError(`"${columna}" no es una columna de ${tabla}.`)
  }
}

async function leerFila(db: ConsultaSql, tabla: string, id: string): Promise<Record<string, unknown>> {
  const leida = await db.query(`select * from ${citar(tabla)} where "id" = $1`, [id])
  const fila = leida.rows[0]
  if (!fila) throw new ConsultaError(`No hay ninguna fila con id "${id}" en ${tabla}.`)
  return fila
}

function valorDe(valor: unknown, udt: string): { valor: unknown; cast: string } {
  const json = udt === 'json' || udt === 'jsonb'
  if (valor !== null && typeof valor === 'object') {
    return { valor: JSON.stringify(valor), cast: json ? `::${udt}` : '' }
  }
  if (json && typeof valor === 'string') return { valor, cast: `::${udt}` }
  return { valor, cast: json ? `::${udt}` : '' }
}

function cambiosDe(pedido: PedidoCorreccion, columnas: Map<string, string>, fila: Record<string, unknown>) {
  const sets: string[] = []
  const params: unknown[] = []
  const antes: Record<string, unknown> = {}
  const despues: Record<string, unknown> = {}
  for (const [columna, valor] of Object.entries(pedido.campos)) {
    if (valor === undefined) throw new ConsultaError(`Falta el valor de "${columna}".`)
    const udt = columnas.get(columna)
    if (udt === undefined || !IDENTIFICADOR.test(columna)) {
      throw new ConsultaError(`"${columna}" no es una columna de ${pedido.tabla}.`)
    }
    const preparado = valorDe(valor, udt)
    params.push(preparado.valor)
    sets.push(`${citar(columna)} = $${params.length}${preparado.cast}`)
    antes[columna] = fila[columna] ?? null
    despues[columna] = valor
  }
  params.push(pedido.id)
  return {
    sql: `update ${citar(pedido.tabla)} set ${sets.join(', ')} where "id" = $${params.length}`,
    params,
    antes,
    despues,
  }
}

async function ordenDeCorreccion(db: ConsultaSql, pedido: PedidoCorreccion): Promise<Orden> {
  const columnas = await columnasEditables(db, pedido.tabla)
  if (pedido.herramienta === 'editar_registro') exigirCampos(pedido.tabla, pedido.campos, columnas)
  const fila = await leerFila(db, pedido.tabla, pedido.id)
  if (pedido.herramienta === 'borrar_registro') {
    const comun = { tabla: pedido.tabla, id: pedido.id, antes: { ...fila }, despues: null }
    return {
      herramienta: pedido.herramienta,
      confirmar: pedido.confirmar,
      clave: pedido.clave,
      vista: { escrito: false, vistaPrevia: true, ...comun },
      sentencias: [{ sql: `delete from ${citar(pedido.tabla)} where "id" = $1`, params: [pedido.id] }],
      resultado: { escrito: true, repetida: false, ...comun },
    }
  }
  const cambio = cambiosDe(pedido, columnas, fila)
  const comun = { tabla: pedido.tabla, id: pedido.id, antes: cambio.antes, despues: cambio.despues }
  return {
    herramienta: pedido.herramienta,
    confirmar: pedido.confirmar,
    clave: pedido.clave,
    vista: { escrito: false, vistaPrevia: true, ...comun },
    sentencias: [{ sql: cambio.sql, params: cambio.params }],
    resultado: { escrito: true, repetida: false, ...comun },
  }
}
