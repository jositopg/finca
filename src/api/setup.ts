import { apiPost, getAccessToken } from './auth'
import { getOrCreateFolder } from './drive'
import { type SheetMeta, saveSheetMeta } from './sheets'

const HEADERS = {
  propiedades: [['id', 'nombre', 'direccion', 'tipo', 'estado', 'folderId', 'creadoEn']],
  transacciones: [
    ['id', 'propiedadId', 'fecha', 'tipo', 'importe', 'categoria', 'descripcion', 'archivos', 'creadoEn'],
  ],
}

export async function setupSpreadsheet(): Promise<SheetMeta> {
  // Create root Drive folder
  const rootFolder = await getOrCreateFolder('Finca — Gestión de Propiedades')

  // Create spreadsheet
  const sheet = await apiPost<{ spreadsheetId: string }>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      properties: { title: 'Finca — Base de datos' },
      sheets: [
        { properties: { title: 'propiedades', index: 0 } },
        { properties: { title: 'transacciones', index: 1 } },
      ],
    },
  )

  const spreadsheetId = sheet.spreadsheetId

  // Move spreadsheet to root folder via Drive PATCH
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

  // Write headers
  await apiPost(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      data: Object.entries(HEADERS).map(([sheetName, values]) => ({
        range: `${sheetName}!A1`,
        values,
      })),
      valueInputOption: 'RAW',
    },
  )

  const meta: SheetMeta = {
    spreadsheetId,
    rootFolderId: rootFolder.id,
  }

  saveSheetMeta(meta)
  return meta
}
