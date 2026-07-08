import { apiPost } from './auth'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

// Ya no es la base de datos en vivo (eso lo lleva Supabase, ver api/db.ts) —
// esto solo sirve para volcar un informe legible y con formato a una hoja de
// cálculo bajo demanda (botón "Exportar a Sheets"). Nada de IDs internos ni
// JSON en crudo: cada hoja está pensada para que Jose trabaje con ella fuera
// de la app.

export interface SheetSpec {
  title: string
  gid: number
  headers: string[]
  rows: (string | number)[][]
  moneyCols: number[] // columnas (0-indexadas) a formatear como moneda
}

export async function writeFormattedSheets(
  spreadsheetId: string,
  sheets: SheetSpec[],
): Promise<void> {
  await apiPost(`${BASE}/${spreadsheetId}/values:batchUpdate`, {
    valueInputOption: 'USER_ENTERED',
    data: sheets.map((s) => ({
      range: `${s.title}!A1`,
      values: [s.headers, ...s.rows],
    })),
  })

  const requests: unknown[] = []
  for (const s of sheets) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: s.gid, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    })
    requests.push({
      repeatCell: {
        range: { sheetId: s.gid, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            backgroundColor: { red: 0.27, green: 0.4, blue: 0.29 },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    })
    for (const col of s.moneyCols) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: s.gid,
            startRowIndex: 1,
            startColumnIndex: col,
            endColumnIndex: col + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '#,##0.00 €' } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      })
    }
    requests.push({
      autoResizeDimensions: {
        dimensions: { sheetId: s.gid, dimension: 'COLUMNS', startIndex: 0, endIndex: s.headers.length },
      },
    })
  }

  if (requests.length > 0) {
    await apiPost(`${BASE}/${spreadsheetId}:batchUpdate`, { requests })
  }
}
