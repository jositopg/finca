import { format, parseISO } from 'date-fns'
import { apiPost, getAccessToken } from './auth'
import { deleteFile, findFileInFolder, getOrCreateFolder } from './drive'
import { writeFormattedSheets, type SheetSpec } from './sheets'
import {
  ESTADO_LABELS,
  miParte,
  TIPO_LABELS,
  type Propiedad,
  type Transaccion,
} from '../types'

const ROOT_FOLDER_NAME = 'Finca — Gestión de Propiedades'
const EXPORT_SHEET_NAME = 'Finca — Exportado'

export interface ExportResult {
  spreadsheetId: string
  url: string
}

const round2 = (n: number) => Math.round(n * 100) / 100
const fecha = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

function buildResumen(propiedades: Propiedad[], transacciones: Transaccion[]) {
  const anio = new Date().getFullYear().toString()
  const headers = [
    'Propiedad',
    'Estado',
    `Ingresos ${anio} (tu parte)`,
    `Gastos ${anio} (tu parte)`,
    'Rendimiento neto (tu parte)',
  ]
  let totalIngresos = 0
  let totalGastos = 0
  const rows = propiedades.map((p) => {
    const txs = transacciones.filter((t) => t.propiedadId === p.id && t.fecha.startsWith(anio))
    const ingresos = txs
      .filter((t) => t.tipo === 'ingreso')
      .reduce((s, t) => s + miParte(t.importe, p), 0)
    const gastos = txs
      .filter((t) => t.tipo === 'gasto')
      .reduce((s, t) => s + miParte(t.importe, p), 0)
    totalIngresos += ingresos
    totalGastos += gastos
    return [p.nombre, ESTADO_LABELS[p.estado], round2(ingresos), round2(gastos), round2(ingresos - gastos)]
  })
  rows.push(['TOTAL', '', round2(totalIngresos), round2(totalGastos), round2(totalIngresos - totalGastos)])
  return { headers, rows, moneyCols: [2, 3, 4] }
}

function buildPropiedades(propiedades: Propiedad[]) {
  const headers = [
    'Nombre',
    'Dirección',
    'Tipo',
    'Estado',
    '% Propiedad',
    'Inquilino',
    'Alquiler mensual',
    'Contrato desde',
    'Contrato hasta',
    'Notas',
  ]
  const rows = propiedades.map((p) => [
    p.nombre,
    p.direccion,
    TIPO_LABELS[p.tipo],
    ESTADO_LABELS[p.estado],
    p.porcentajePropiedad ?? 100,
    p.inquilinoNombre ?? '',
    p.alquilerMensual != null ? round2(p.alquilerMensual) : '',
    p.contratoInicio ? fecha(p.contratoInicio) : '',
    p.contratoFin ? fecha(p.contratoFin) : '',
    p.notas ?? '',
  ])
  return { headers, rows, moneyCols: [6] }
}

function buildMovimientos(propiedades: Propiedad[], transacciones: Transaccion[]) {
  const headers = ['Fecha', 'Propiedad', 'Tipo', 'Categoría', 'Importe', 'Descripción', 'Referencia']
  const nombrePorId = new Map(propiedades.map((p) => [p.id, p.nombre]))
  const rows = [...transacciones]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((t) => [
      fecha(t.fecha),
      nombrePorId.get(t.propiedadId) ?? '(propiedad eliminada)',
      t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      t.categoria,
      round2(t.importe),
      t.descripcion,
      t.referencia ?? '',
    ])
  return { headers, rows, moneyCols: [4] }
}

function buildHistorial(propiedades: Propiedad[]) {
  const headers = ['Propiedad', 'Inquilino', 'Desde', 'Hasta', 'Alquiler mensual']
  const rows: (string | number)[][] = []
  for (const p of propiedades) {
    for (const c of p.historialContratos ?? []) {
      rows.push([
        p.nombre,
        c.inquilinoNombre ?? '',
        c.fechaInicio ? fecha(c.fechaInicio) : '',
        fecha(c.fechaFin),
        c.alquilerMensual != null ? round2(c.alquilerMensual) : '',
      ])
    }
  }
  return { headers, rows, moneyCols: [4] }
}

// Crea (sustituyendo cualquier exportación anterior) una hoja con un
// informe legible — nada de IDs internos ni JSON en crudo — pensado para
// trabajar con los datos fuera de la app: Resumen, Propiedades, Movimientos
// e Historial de alquileres. Requiere que ya se haya concedido el token de
// Drive (ensureDriveAccess en AppContext).
export async function exportarASheets(
  propiedades: Propiedad[],
  transacciones: Transaccion[],
): Promise<ExportResult> {
  const rootFolder = await getOrCreateFolder(ROOT_FOLDER_NAME)

  const existing = await findFileInFolder(rootFolder.id, EXPORT_SHEET_NAME)
  if (existing) {
    await deleteFile(existing.id)
  }

  const sheetTitles = ['Resumen', 'Propiedades', 'Movimientos', 'Historial de alquileres']
  const sheet = await apiPost<{
    spreadsheetId: string
    sheets: { properties: { sheetId: number; title: string } }[]
  }>('https://sheets.googleapis.com/v4/spreadsheets', {
    properties: { title: EXPORT_SHEET_NAME, locale: 'es_ES' },
    sheets: sheetTitles.map((title, index) => ({ properties: { title, index } })),
  })

  const spreadsheetId = sheet.spreadsheetId

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

  const gidByTitle = new Map(sheet.sheets.map((s) => [s.properties.title, s.properties.sheetId]))

  const specs: SheetSpec[] = [
    { title: 'Resumen', gid: gidByTitle.get('Resumen')!, ...buildResumen(propiedades, transacciones) },
    { title: 'Propiedades', gid: gidByTitle.get('Propiedades')!, ...buildPropiedades(propiedades) },
    { title: 'Movimientos', gid: gidByTitle.get('Movimientos')!, ...buildMovimientos(propiedades, transacciones) },
    {
      title: 'Historial de alquileres',
      gid: gidByTitle.get('Historial de alquileres')!,
      ...buildHistorial(propiedades),
    },
  ]

  await writeFormattedSheets(spreadsheetId, specs)

  return {
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  }
}
