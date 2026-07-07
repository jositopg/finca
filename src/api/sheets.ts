import { apiPost } from './auth'
import type { Propiedad, Transaccion } from '../types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

// Ya no es la base de datos en vivo (eso lo lleva Supabase, ver api/db.ts) —
// esto solo sirve para volcar un snapshot completo a una hoja de cálculo
// bajo demanda (botón "Exportar a Sheets").

export const PROP_HEADERS = [
  'id', 'nombre', 'direccion', 'tipo', 'estado', 'folderId', 'creadoEn',
  'inquilinoNombre', 'alquilerMensual', 'contratoFin', 'notas',
  'contratoArchivoId', 'contratoArchivoNombre', 'reparto',
  'contratoInicio', 'historialContratos',
]

export const TX_HEADERS = [
  'id', 'propiedadId', 'fecha', 'tipo', 'importe', 'categoria',
  'descripcion', 'archivos', 'creadoEn', 'referencia',
]

export function propiedadToRow(p: Propiedad): string[] {
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

export function transaccionToRow(t: Transaccion): string[] {
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

// Sustituye todo el contenido de la hoja por el estado actual — exportación
// completa de un solo golpe, no una sincronización incremental.
export async function writeExport(
  spreadsheetId: string,
  propiedades: Propiedad[],
  transacciones: Transaccion[],
): Promise<void> {
  await apiPost(`${BASE}/${spreadsheetId}/values:batchClear`, {
    ranges: ['propiedades!A1:P', 'transacciones!A1:J'],
  })

  await apiPost(`${BASE}/${spreadsheetId}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: [
      {
        range: 'propiedades!A1',
        values: [PROP_HEADERS, ...propiedades.map(propiedadToRow)],
      },
      {
        range: 'transacciones!A1',
        values: [TX_HEADERS, ...transacciones.map(transaccionToRow)],
      },
    ],
  })
}
