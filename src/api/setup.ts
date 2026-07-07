import { apiPost, getAccessToken } from './auth'
import { findFileInFolder, getOrCreateFolder } from './drive'
import { writeExport } from './sheets'
import type { Propiedad, Transaccion } from '../types'

const ROOT_FOLDER_NAME = 'Finca — Gestión de Propiedades'
const EXPORT_SHEET_NAME = 'Finca — Exportado'

export interface ExportResult {
  spreadsheetId: string
  url: string
}

// Crea (o reutiliza, por nombre) una hoja de cálculo en la carpeta de Drive
// de la app y vuelca en ella el estado actual de propiedades y
// transacciones. Requiere que ya se haya concedido el token de Drive
// (ensureDriveAccess en AppContext).
export async function exportarASheets(
  propiedades: Propiedad[],
  transacciones: Transaccion[],
): Promise<ExportResult> {
  const rootFolder = await getOrCreateFolder(ROOT_FOLDER_NAME)

  const existing = await findFileInFolder(rootFolder.id, EXPORT_SHEET_NAME)
  let spreadsheetId: string

  if (existing) {
    spreadsheetId = existing.id
  } else {
    const sheet = await apiPost<{ spreadsheetId: string }>(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        properties: { title: EXPORT_SHEET_NAME },
        sheets: [
          { properties: { title: 'propiedades', index: 0 } },
          { properties: { title: 'transacciones', index: 1 } },
        ],
      },
    )
    spreadsheetId = sheet.spreadsheetId

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
  }

  await writeExport(spreadsheetId, propiedades, transacciones)

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  }
}
