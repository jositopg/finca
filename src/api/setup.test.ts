import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngresoExterno, Propiedad, Transaccion } from '../types'

vi.mock('./drive', () => ({
  getOrCreateFolder: vi.fn(async (name: string) => ({
    id: 'root-folder-id',
    name,
    mimeType: 'application/vnd.google-apps.folder',
  })),
  findFileInFolder: vi.fn(async () => null),
  deleteFile: vi.fn(async () => {}),
}))

const mockApiPost = vi.fn(async (url: string, body: { sheets: { properties: { title: string } }[] }) => {
  if (url === 'https://sheets.googleapis.com/v4/spreadsheets') {
    return {
      spreadsheetId: 'sheet123',
      sheets: body.sheets.map((s, i) => ({ properties: { sheetId: i + 1, title: s.properties.title } })),
    }
  }
  return {}
})

vi.mock('./auth', () => ({
  apiPost: (url: string, body: unknown) => mockApiPost(url, body as never),
  getAccessToken: () => 'fake-token',
}))

const mockWriteFormattedSheets = vi.fn(async (_spreadsheetId: string, _specs: unknown) => {})
vi.mock('./sheets', () => ({
  writeFormattedSheets: (spreadsheetId: string, specs: unknown) => mockWriteFormattedSheets(spreadsheetId, specs),
}))

// La llamada directa a fetch() en exportarASheets (mover el Sheet a su
// carpeta) no pasa por auth.ts — se stubea aparte.
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

const { exportarASheets } = await import('./setup')

function propiedad(overrides: Partial<Propiedad> & Pick<Propiedad, 'id' | 'nombre' | 'tipo'>): Propiedad {
  return {
    direccion: '',
    estado: 'alquilado',
    folderId: '',
    creadoEn: '2024-01-01',
    ...overrides,
  }
}

function tx(overrides: Partial<Transaccion> & Pick<Transaccion, 'propiedadId' | 'fecha' | 'tipo' | 'importe' | 'categoria'>): Transaccion {
  return {
    id: crypto.randomUUID(),
    descripcion: '',
    archivos: [],
    creadoEn: `${overrides.fecha}T00:00:00.000Z`,
    ...overrides,
  }
}

describe('exportarASheets', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    mockApiPost.mockClear()
    mockWriteFormattedSheets.mockClear()
  })

  it('genera todas las hojas con las cifras esperadas', async () => {
    const p1 = propiedad({
      id: 'p1',
      nombre: 'Piso Mayor',
      tipo: 'piso',
      porcentajePropiedad: 50,
      valorMercado: 200000,
      reparto: { agua: { modo: 'parcial', importeIncluido: 10 }, luz: { modo: 'incluido' } },
      gastosRecurrentes: [{ id: 'g1', categoria: 'Comunidad de propietarios', importe: 50, creadoEn: '2025-01-01' }],
      historialContratos: [
        {
          id: 'h1',
          inquilinoNombre: 'Ana',
          alquilerMensual: 900,
          fechaInicio: '2024-01-01',
          fechaFin: '2024-12-31',
        },
      ],
    })
    const p2 = propiedad({ id: 'p2', nombre: 'Local Puerto', tipo: 'local' })
    const p3 = propiedad({ id: 'p3', nombre: 'Piso de Martín', tipo: 'piso', propietarioNombre: 'Martín' })
    const propiedades = [p1, p2, p3]

    const transacciones: Transaccion[] = [
      tx({ propiedadId: 'p1', fecha: '2025-01-05', tipo: 'ingreso', importe: 1000, categoria: 'Alquiler mensual' }),
      tx({ propiedadId: 'p1', fecha: '2025-02-05', tipo: 'ingreso', importe: 1000, categoria: 'Alquiler mensual' }),
      tx({ propiedadId: 'p1', fecha: '2025-01-01', tipo: 'gasto', importe: 50, categoria: 'Comunidad de propietarios' }),
      tx({ propiedadId: 'p1', fecha: '2025-03-10', tipo: 'gasto', importe: 40, categoria: 'Agua' }),
      tx({ propiedadId: 'p1', fecha: '2026-01-05', tipo: 'ingreso', importe: 1000, categoria: 'Alquiler mensual' }),
      tx({ propiedadId: 'p1', fecha: '2026-04-05', tipo: 'gasto', importe: 40, categoria: 'Agua' }),
      tx({ propiedadId: 'p2', fecha: '2025-01-15', tipo: 'ingreso', importe: 500, categoria: 'Alquiler mensual' }),
      tx({ propiedadId: 'p2', fecha: '2025-04-15', tipo: 'ingreso', importe: 500, categoria: 'Alquiler mensual' }),
      tx({ propiedadId: 'p2', fecha: '2026-02-15', tipo: 'ingreso', importe: 500, categoria: 'Alquiler mensual' }),
      tx({ propiedadId: 'p3', fecha: '2025-05-05', tipo: 'ingreso', importe: 700, categoria: 'Alquiler mensual' }),
      tx({ propiedadId: 'p3', fecha: '2025-05-10', tipo: 'gasto', importe: 100, categoria: 'Mantenimiento' }),
    ]

    const ingresosExternos: IngresoExterno[] = [
      { id: 'i1', nombre: 'Nómina', importeAnual: 24000, porcentajeRetencion: 15, creadoEn: '2025-01-01' },
    ]

    await exportarASheets(propiedades, transacciones, ingresosExternos)

    expect(mockWriteFormattedSheets).toHaveBeenCalledTimes(1)
    const [, specsArg] = mockWriteFormattedSheets.mock.calls[0]
    const specs = specsArg as { title: string; headers: string[]; rows: (string | number)[][] }[]
    const byTitle = new Map(specs.map((s) => [s.title, s]))

    // Las 12 hojas deben generarse — hay datos para todas.
    expect([...byTitle.keys()]).toEqual([
      'Resumen',
      'Propiedades',
      'Reparto de suministros',
      'Gastos fijos mensuales',
      'Movimientos',
      'Historial de alquileres',
      'Rentabilidad y valoración',
      'Evolución anual',
      'Modelo 420',
      'Estimador Renta (resumen)',
      'Estimador Renta (por propiedad)',
      'Ingresos externos',
    ])

    // Resumen: año en curso 2026 (reloj fijado a 2026-06-15).
    const resumen = byTitle.get('Resumen')!
    const filaP1 = resumen.rows.find((r) => r[0] === 'Piso Mayor')!
    expect(filaP1).toEqual(['Piso Mayor', 'Tuya', 'Alquilado', 500, 20, 480, ''])
    const filaP3 = resumen.rows.find((r) => r[0] === 'Piso de Martín')!
    expect(filaP3[1]).toBe('De Martín')
    const totalRow = resumen.rows[resumen.rows.length - 1]
    expect(totalRow).toEqual(['TOTAL (tus propiedades)', '', '', 1000, 20, 980, ''])

    // Reparto de suministros: solo p1 tiene reparto configurado.
    const reparto = byTitle.get('Reparto de suministros')!
    expect(reparto.rows).toEqual([['Piso Mayor', 'Parcial (10 €/factura)', 'Incluido', '', '']])

    // Gastos fijos mensuales: un gasto recurrente en p1.
    const gastosFijos = byTitle.get('Gastos fijos mensuales')!
    expect(gastosFijos.rows).toEqual([['Piso Mayor', 'Comunidad de propietarios', 50, '', '01/01/2025']])

    // Historial de alquileres: un contrato terminado en p1.
    const historial = byTitle.get('Historial de alquileres')!
    expect(historial.rows[0]).toEqual([
      'Piso Mayor',
      'Ana',
      '',
      '',
      '',
      900,
      '01/01/2024',
      '31/12/2024',
      '',
    ])

    // Rentabilidad: solo p1 tiene valorMercado.
    const rentabilidad = byTitle.get('Rentabilidad y valoración')!
    expect(rentabilidad.rows).toHaveLength(1)
    expect(rentabilidad.rows[0][0]).toBe('Piso Mayor')
    expect(rentabilidad.rows[0][3]).toBe('Mercado')

    // Modelo 420: p2 es local, renta neta 500€ en T1-2025, T2-2025, T1-2026.
    const modelo420 = byTitle.get('Modelo 420')!
    expect(modelo420.rows).toHaveLength(3)
    for (const row of modelo420.rows) {
      expect(row[2]).toBe('Local Puerto')
      expect(row[6]).toBe(500) // renta neta cobrada, sin redondeos de por medio
      expect(row[3]).toBeCloseTo(500 / 0.88, 2) // base imponible reconstruida
    }
    expect(modelo420.rows.map((r) => `${r[0]}-${r[1]}`)).toEqual(['2025-T1', '2025-T2', '2026-T1'])

    // Evolución anual: propiedades de Jose únicamente (no la de Martín), y
    // el año 2026 debe coincidir exactamente con el total de "Resumen".
    const evolucion = byTitle.get('Evolución anual')!
    expect(evolucion.headers).toEqual(['Año', 'Piso Mayor', 'Local Puerto', 'Total'])
    const fila2026 = evolucion.rows.find((r) => r[0] === '2026')!
    expect(fila2026).toEqual(['2026', 480, 500, 980])

    // Ingresos externos: se listan tal cual están configurados.
    const ingresos = byTitle.get('Ingresos externos')!
    expect(ingresos.rows).toEqual([['Nómina', 24000, 15]])

    // Estimador de la Renta: una fila por año con datos (2025 y 2026).
    const estimadorResumen = byTitle.get('Estimador Renta (resumen)')!
    expect(estimadorResumen.rows.map((r) => r[0])).toEqual(['2025', '2026'])
  })

  it('omite las hojas opcionales sin datos, pero conserva las básicas', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'Piso Solo', tipo: 'piso' })
    await exportarASheets([p1], [], [])

    const [, specsArg] = mockWriteFormattedSheets.mock.calls[0]
    const specs = specsArg as { title: string }[]
    const titles = specs.map((s) => s.title)

    // "Estimador Renta" siempre genera una fila para el año en curso (con
    // ceros) porque estimarAhorroRenta() recorre las propiedades aunque no
    // tengan transacciones — no es ruido falso, es una fila real.
    expect(titles).toEqual([
      'Resumen',
      'Propiedades',
      'Movimientos',
      'Estimador Renta (resumen)',
      'Estimador Renta (por propiedad)',
    ])
  })
})
