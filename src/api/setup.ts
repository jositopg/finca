import { apiPost, getAccessToken } from './auth'
import { findFileInFolder, getOrCreateFolder } from './drive'
import type { SheetMeta } from './sheets'

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

const ROOT_FOLDER_NAME = 'Finca — Gestión de Propiedades'
const SHEET_NAME = 'Finca — Base de datos'

export async function setupSpreadsheet(): Promise<SheetMeta> {
  // Always get or create the root folder
  const rootFolder = await getOrCreateFolder(ROOT_FOLDER_NAME)

  // Look for an existing spreadsheet — this makes multi-device work
  const existing = await findFileInFolder(rootFolder.id, SHEET_NAME)
  if (existing) {
    return { spreadsheetId: existing.id, rootFolderId: rootFolder.id }
  }

  // Create new spreadsheet
  const sheet = await apiPost<{ spreadsheetId: string }>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      properties: { title: SHEET_NAME },
      sheets: [
        { properties: { title: 'propiedades', index: 0 } },
        { properties: { title: 'transacciones', index: 1 } },
      ],
    },
  )

  const spreadsheetId = sheet.spreadsheetId

  // Move into root folder
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${rootFolder.id}&removeParents=root&fields=id,parents`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
      },
    },
  )

  // Write full headers (v2 schema)
  await apiPost(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      data: [
        { range: 'propiedades!A1', values: [PROP_HEADERS] },
        { range: 'transacciones!A1', values: [TX_HEADERS] },
      ],
      valueInputOption: 'RAW',
    },
  )

  return { spreadsheetId, rootFolderId: rootFolder.id }
}
