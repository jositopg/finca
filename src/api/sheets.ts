import { apiGet, apiPost, apiPut } from './auth'
import type { Propiedad, Transaccion } from '../types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export interface SheetMeta {
  spreadsheetId: string
  rootFolderId: string
}

const STORAGE_KEY = 'finca_sheet_meta'

export function getSheetMeta(): SheetMeta | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as SheetMeta) : null
}

export function saveSheetMeta(meta: SheetMeta): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta))
}

export function clearSheetMeta(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Read helpers ────────────────────────────────────────────────────────────

function rowToPropiedad(row: string[]): Propiedad {
  return {
    id: row[0],
    nombre: row[1],
    direccion: row[2],
    tipo: row[3] as Propiedad['tipo'],
    estado: row[4] as Propiedad['estado'],
    folderId: row[5],
    creadoEn: row[6],
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
    descripcion: row[6],
    archivos: row[7] ? (JSON.parse(row[7]) as string[]) : [],
    creadoEn: row[8],
  }
}

function propiedadToRow(p: Propiedad): string[] {
  return [p.id, p.nombre, p.direccion, p.tipo, p.estado, p.folderId, p.creadoEn]
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
  ]
}

// ─── Propiedades ─────────────────────────────────────────────────────────────

export async function getPropiedades(spreadsheetId: string): Promise<Propiedad[]> {
  const res = await apiGet<{ values?: string[][] }>(
    `${BASE}/${spreadsheetId}/values/propiedades!A2:G`,
  )
  if (!res.values || res.values.length === 0) return []
  return res.values.filter((r) => r[0]).map(rowToPropiedad)
}

export async function addPropiedad(
  spreadsheetId: string,
  propiedad: Propiedad,
): Promise<void> {
  await apiPost(
    `${BASE}/${spreadsheetId}/values/propiedades!A:G:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
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
  const row = idx + 2 // header is row 1, data starts at row 2
  await apiPut(
    `${BASE}/${spreadsheetId}/values/propiedades!A${row}:G${row}?valueInputOption=RAW`,
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
    `${BASE}/${spreadsheetId}/values/propiedades!A${row}:G${row}?valueInputOption=RAW`,
    { values: [['', '', '', '', '', '', '']] },
  )
}

// ─── Transacciones ───────────────────────────────────────────────────────────

export async function getTransacciones(spreadsheetId: string): Promise<Transaccion[]> {
  const res = await apiGet<{ values?: string[][] }>(
    `${BASE}/${spreadsheetId}/values/transacciones!A2:I`,
  )
  if (!res.values || res.values.length === 0) return []
  return res.values.filter((r) => r[0]).map(rowToTransaccion)
}

export async function addTransaccion(
  spreadsheetId: string,
  transaccion: Transaccion,
): Promise<void> {
  await apiPost(
    `${BASE}/${spreadsheetId}/values/transacciones!A:I:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
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
    `${BASE}/${spreadsheetId}/values/transacciones!A${row}:I${row}?valueInputOption=RAW`,
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
    `${BASE}/${spreadsheetId}/values/transacciones!A${row}:I${row}?valueInputOption=RAW`,
    { values: [['', '', '', '', '', '', '', '', '']] },
  )
}
