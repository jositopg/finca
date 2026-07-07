import { apiGet, apiPost, apiPut } from './auth'
import type { ContratoHistorico, Propiedad, Reparto, Transaccion } from '../types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export interface SheetMeta {
  spreadsheetId: string
  rootFolderId: string
}

// ─── Schema migration ─────────────────────────────────────────────────────────

const PROP_HEADERS = [
  'id', 'nombre', 'direccion', 'tipo', 'estado', 'folderId', 'creadoEn',
  'inquilinoNombre', 'alquilerMensual', 'contratoFin', 'notas',
  'contratoArchivoId', 'contratoArchivoNombre', 'reparto',
  'contratoInicio', 'historialContratos',
]

const TX_HEADERS = [
  'id', 'propiedadId', 'fecha', 'tipo', 'importe', 'categoria',
  'descripcion', 'archivos', 'creadoEn', 'referencia',
]

export async function migrateHeaders(spreadsheetId: string): Promise<void> {
  const [propHead, txHead] = await Promise.all([
    apiGet<{ values?: string[][] }>(`${BASE}/${spreadsheetId}/values/propiedades!A1:P1`),
    apiGet<{ values?: string[][] }>(`${BASE}/${spreadsheetId}/values/transacciones!A1:J1`),
  ])

  const promises: Promise<unknown>[] = []

  if (!propHead.values?.[0] || propHead.values[0].length < PROP_HEADERS.length) {
    promises.push(
      apiPut(
        `${BASE}/${spreadsheetId}/values/propiedades!A1:P1?valueInputOption=RAW`,
        { values: [PROP_HEADERS] },
      ),
    )
  }

  if (!txHead.values?.[0] || txHead.values[0].length < TX_HEADERS.length) {
    promises.push(
      apiPut(
        `${BASE}/${spreadsheetId}/values/transacciones!A1:J1?valueInputOption=RAW`,
        { values: [TX_HEADERS] },
      ),
    )
  }

  if (promises.length > 0) await Promise.all(promises)
}

// ─── Row parsers ──────────────────────────────────────────────────────────────

function rowToPropiedad(row: string[]): Propiedad {
  return {
    id: row[0],
    nombre: row[1],
    direccion: row[2] ?? '',
    tipo: row[3] as Propiedad['tipo'],
    estado: row[4] as Propiedad['estado'],
    folderId: row[5] ?? '',
    creadoEn: row[6] ?? '',
    inquilinoNombre: row[7] || undefined,
    alquilerMensual: row[8] ? parseFloat(row[8]) : undefined,
    contratoFin: row[9] || undefined,
    notas: row[10] || undefined,
    contratoArchivoId: row[11] || undefined,
    contratoArchivoNombre: row[12] || undefined,
    reparto: row[13] ? (JSON.parse(row[13]) as Reparto) : undefined,
    contratoInicio: row[14] || undefined,
    historialContratos: row[15] ? (JSON.parse(row[15]) as ContratoHistorico[]) : undefined,
  }
}

function rowToTransaccion(row: string[]): Transaccion {
  return {
    id: row[0],
    propiedadId: row[1],
    fecha: row[2],
    tipo: row[3] as Transaccion['tipo'],
    importe: parseFloat(row[4]),
    categoria: row[5],
    descripcion: row[6] ?? '',
    archivos: row[7] ? (JSON.parse(row[7]) as string[]) : [],
    creadoEn: row[8] ?? '',
    referencia: row[9] || undefined,
  }
}

function propiedadToRow(p: Propiedad): string[] {
  return [
    p.id,
    p.nombre,
    p.direccion,
    p.tipo,
    p.estado,
    p.folderId,
    p.creadoEn,
    p.inquilinoNombre ?? '',
    p.alquilerMensual != null ? p.alquilerMensual.toFixed(2) : '',
    p.contratoFin ?? '',
    p.notas ?? '',
    p.contratoArchivoId ?? '',
    p.contratoArchivoNombre ?? '',
    p.reparto ? JSON.stringify(p.reparto) : '',
    p.contratoInicio ?? '',
    p.historialContratos ? JSON.stringify(p.historialContratos) : '',
  ]
}

function transaccionToRow(t: Transaccion): string[] {
  return [
    t.id,
    t.propiedadId,
    t.fecha,
    t.tipo,
    t.importe.toFixed(2),
    t.categoria,
    t.descripcion,
    JSON.stringify(t.archivos),
    t.creadoEn,
    t.referencia ?? '',
  ]
}

// ─── Propiedades ─────────────────────────────────────────────────────────────

export async function getPropiedades(spreadsheetId: string): Promise<Propiedad[]> {
  const res = await apiGet<{ values?: string[][] }>(
    `${BASE}/${spreadsheetId}/values/propiedades!A2:P`,
  )
  if (!res.values || res.values.length === 0) return []
  return res.values.filter((r) => r[0]).map(rowToPropiedad)
}

export async function addPropiedad(
  spreadsheetId: string,
  propiedad: Propiedad,
): Promise<void> {
  await apiPost(
    `${BASE}/${spreadsheetId}/values/propiedades!A:P:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values: [propiedadToRow(propiedad)] },
  )
}

export async function updatePropiedad(
  spreadsheetId: string,
  propiedad: Propiedad,
): Promise<void> {
  const all = await getPropiedades(spreadsheetId)
  const idx = all.findIndex((p) => p.id === propiedad.id)
  if (idx === -1) throw new Error('Propiedad no encontrada')
  const row = idx + 2
  await apiPut(
    `${BASE}/${spreadsheetId}/values/propiedades!A${row}:P${row}?valueInputOption=RAW`,
    { values: [propiedadToRow(propiedad)] },
  )
}

export async function deletePropiedad(
  spreadsheetId: string,
  propiedadId: string,
): Promise<void> {
  const all = await getPropiedades(spreadsheetId)
  const idx = all.findIndex((p) => p.id === propiedadId)
  if (idx === -1) return
  const row = idx + 2
  await apiPut(
    `${BASE}/${spreadsheetId}/values/propiedades!A${row}:P${row}?valueInputOption=RAW`,
    { values: [Array(16).fill('')] },
  )
}

// ─── Transacciones ───────────────────────────────────────────────────────────

export async function getTransacciones(spreadsheetId: string): Promise<Transaccion[]> {
  const res = await apiGet<{ values?: string[][] }>(
    `${BASE}/${spreadsheetId}/values/transacciones!A2:J`,
  )
  if (!res.values || res.values.length === 0) return []
  return res.values.filter((r) => r[0]).map(rowToTransaccion)
}

export async function addTransaccion(
  spreadsheetId: string,
  transaccion: Transaccion,
): Promise<void> {
  await apiPost(
    `${BASE}/${spreadsheetId}/values/transacciones!A:J:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values: [transaccionToRow(transaccion)] },
  )
}

export async function updateTransaccion(
  spreadsheetId: string,
  transaccion: Transaccion,
): Promise<void> {
  const all = await getTransacciones(spreadsheetId)
  const idx = all.findIndex((t) => t.id === transaccion.id)
  if (idx === -1) throw new Error('Transacción no encontrada')
  const row = idx + 2
  await apiPut(
    `${BASE}/${spreadsheetId}/values/transacciones!A${row}:J${row}?valueInputOption=RAW`,
    { values: [transaccionToRow(transaccion)] },
  )
}

export async function deleteTransaccion(
  spreadsheetId: string,
  transaccionId: string,
): Promise<void> {
  const all = await getTransacciones(spreadsheetId)
  const idx = all.findIndex((t) => t.id === transaccionId)
  if (idx === -1) return
  const row = idx + 2
  await apiPut(
    `${BASE}/${spreadsheetId}/values/transacciones!A${row}:J${row}?valueInputOption=RAW`,
    { values: [Array(10).fill('')] },
  )
}
