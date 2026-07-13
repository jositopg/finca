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

type Spec = { title: string; headers: string[]; rows: (string | number)[][]; moneyCols: number[] }

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

async function exportar(propiedades: Propiedad[], transacciones: Transaccion[], ingresosExternos: IngresoExterno[]) {
  await exportarASheets(propiedades, transacciones, ingresosExternos)
  const [, specsArg] = mockWriteFormattedSheets.mock.calls[0]
  const specs = specsArg as Spec[]
  return new Map(specs.map((s) => [s.title, s]))
}

const TODAS_LAS_HOJAS = [
  'Resumen',
  'Propiedades',
  'Reparto de suministros',
  'Gastos fijos mensuales',
  'Movimientos',
  'Historial de alquileres',
  'Rentabilidad y valoración',
  'Evolución anual',
  'Modelo 420',
  'Tramos IRPF',
  'Estimador Renta (resumen)',
  'Estimador Renta (por propiedad)',
  'Ingresos externos',
]

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

  it('genera siempre las 13 hojas, incluso sin ningún dato', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'Piso Solo', tipo: 'piso' })
    const byTitle = await exportar([p1], [], [])
    expect([...byTitle.keys()]).toEqual(TODAS_LAS_HOJAS)
  })

  it('Tramos IRPF: tabla de referencia con la escala aproximada', async () => {
    const byTitle = await exportar([propiedad({ id: 'p1', nombre: 'X', tipo: 'piso' })], [], [])
    const tramos = byTitle.get('Tramos IRPF')!
    expect(tramos.rows).toEqual([
      [0, 12450, 19],
      [12450, 20200, 24],
      [20200, 35200, 30],
      [35200, 60000, 37],
      [60000, 300000, 45],
      [300000, 999999999, 47],
    ])
  })

  it('Resumen: fórmulas SUMIFS/VLOOKUP escaladas por % propiedad y gestión', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'Piso Mayor', tipo: 'piso', porcentajePropiedad: 50 })
    const p2 = propiedad({ id: 'p2', nombre: 'Piso de Martín', tipo: 'piso', propietarioNombre: 'Martín' })
    const byTitle = await exportar([p1, p2], [], [])
    const resumen = byTitle.get('Resumen')!

    expect(resumen.headers).toEqual([
      'Propiedad',
      'Gestión',
      'Estado',
      'Ingresos 2026',
      'Gastos 2026',
      'Neto',
      'Renta pendiente',
    ])

    const filaP1 = resumen.rows[0]
    expect(filaP1[0]).toBe('Piso Mayor')
    expect(filaP1[1]).toBe('Tuya')
    expect(filaP1[3]).toBe(
      '=SUMIFS(\'Movimientos\'!$F:$F;\'Movimientos\'!$B:$B;$A2;\'Movimientos\'!$D:$D;"Ingreso";\'Movimientos\'!$A:$A;">="&DATE(2026;1;1);\'Movimientos\'!$A:$A;"<="&DATE(2026;12;31))*VLOOKUP($A2;\'Propiedades\'!$A:$G;7;FALSE)/100',
    )
    expect(filaP1[5]).toBe('=D2-E2')

    // Gestionada para Martín: sin escalar por % propiedad (factor "*1").
    const filaP2 = resumen.rows[1]
    expect(filaP2[1]).toBe('De Martín')
    expect(filaP2[3]).toBe(
      '=SUMIFS(\'Movimientos\'!$F:$F;\'Movimientos\'!$B:$B;$A3;\'Movimientos\'!$D:$D;"Ingreso";\'Movimientos\'!$A:$A;">="&DATE(2026;1;1);\'Movimientos\'!$A:$A;"<="&DATE(2026;12;31))*1',
    )

    // Fila TOTAL: solo suma las filas "Tuya" y que no sean uso propio/vivienda habitual.
    const total = resumen.rows[2]
    expect(total[0]).toBe('TOTAL (tus propiedades en alquiler)')
    expect(total[3]).toBe(
      '=SUMIFS(D$2:D$3;$B$2:$B$3;"Tuya";$C$2:$C$3;"<>Uso propio";$C$2:$C$3;"<>Vivienda habitual")',
    )
    expect(total[5]).toBe('=D4-E4')
  })

  it('Resumen: excluye del TOTAL las propiedades de uso propio/vivienda habitual', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'Piso Alquilado', tipo: 'piso' })
    const p2 = propiedad({ id: 'p2', nombre: 'Mi vivienda', tipo: 'piso', estado: 'vivienda_habitual' })
    const byTitle = await exportar([p1, p2], [], [])
    const resumen = byTitle.get('Resumen')!
    const total = resumen.rows[resumen.rows.length - 1]
    expect(total[3]).toBe(
      '=SUMIFS(D$2:D$3;$B$2:$B$3;"Tuya";$C$2:$C$3;"<>Uso propio";$C$2:$C$3;"<>Vivienda habitual")',
    )
  })

  it('Movimientos: reparto por fórmula referenciando "Reparto de suministros"', async () => {
    const p1 = propiedad({
      id: 'p1',
      nombre: 'Piso Mayor',
      tipo: 'piso',
      reparto: { agua: { modo: 'parcial', importeIncluido: 10 } },
    })
    const transacciones = [tx({ propiedadId: 'p1', fecha: '2025-03-10', tipo: 'gasto', importe: 40, categoria: 'Agua' })]
    const byTitle = await exportar([p1], transacciones, [])
    const mov = byTitle.get('Movimientos')!

    expect(mov.rows).toHaveLength(1)
    const [fila] = mov.rows
    expect(fila[0]).toBe('10/03/2025')
    expect(fila[1]).toBe('Piso Mayor')
    expect(fila[5]).toBe(40)
    expect(fila[6]).toBe(
      '=IFS(E2="Agua";IFERROR(IFS(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;2;FALSE)="Incluido";F2;VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;2;FALSE)="No incluido";0;TRUE;MIN(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;3;FALSE);F2));"");E2="Electricidad";IFERROR(IFS(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;4;FALSE)="Incluido";F2;VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;4;FALSE)="No incluido";0;TRUE;MIN(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;5;FALSE);F2));"");E2="Tasa de basuras";IFERROR(IFS(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;6;FALSE)="Incluido";F2;VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;6;FALSE)="No incluido";0;TRUE;MIN(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;7;FALSE);F2));"");E2="IBI";IFERROR(IFS(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;8;FALSE)="Incluido";F2;VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;8;FALSE)="No incluido";0;TRUE;MIN(VLOOKUP($B2;\'Reparto de suministros\'!$A:$I;9;FALSE);F2));"");TRUE;"")',
    )
    expect(fila[7]).toBe('=IF(G2="";"";F2-G2)')
  })

  it('Reparto de suministros: modo + importe en columnas separadas (no texto libre)', async () => {
    const p1 = propiedad({
      id: 'p1',
      nombre: 'Piso Mayor',
      tipo: 'piso',
      reparto: { agua: { modo: 'parcial', importeIncluido: 10 }, luz: { modo: 'incluido' } },
    })
    const byTitle = await exportar([p1], [], [])
    const reparto = byTitle.get('Reparto de suministros')!
    expect(reparto.rows).toEqual([['Piso Mayor', 'Parcial', 10, 'Incluido', '', '', '', '', '']])
  })

  it('Modelo 420: base/IGIC/IRPF por fórmula a partir de la renta neta', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'Local Puerto', tipo: 'local' })
    const transacciones = [tx({ propiedadId: 'p1', fecha: '2025-01-15', tipo: 'ingreso', importe: 500, categoria: 'Alquiler mensual' })]
    const byTitle = await exportar([p1], transacciones, [])
    const modelo420 = byTitle.get('Modelo 420')!

    expect(modelo420.rows).toHaveLength(1)
    const [fila] = modelo420.rows
    expect(fila[0]).toBe('2025')
    expect(fila[1]).toBe('T1')
    expect(fila[6]).toBe(
      '=SUMIFS(\'Movimientos\'!$F:$F;\'Movimientos\'!$B:$B;$C2;\'Movimientos\'!$D:$D;"Ingreso";\'Movimientos\'!$E:$E;"Alquiler mensual";\'Movimientos\'!$A:$A;">="&DATE($A2;(VALUE(MID($B2;2;1))-1)*3+1;1);\'Movimientos\'!$A:$A;"<="&EOMONTH(DATE($A2;(VALUE(MID($B2;2;1))-1)*3+1;1);2))*VLOOKUP($C2;\'Propiedades\'!$A:$G;7;FALSE)/100',
    )
    expect(fila[3]).toBe('=G2/0,88')
    expect(fila[4]).toBe('=D2*0,07')
    expect(fila[5]).toBe('=D2*0,19')
  })

  it('Estimador Renta (resumen): cuota total (no solo la marginal de alquileres) y toda la retención', async () => {
    const byTitle = await exportar([propiedad({ id: 'p1', nombre: 'X', tipo: 'piso' })], [], [])
    const resumen = byTitle.get('Estimador Renta (resumen)')!
    expect(resumen.headers).toEqual([
      'Año',
      'Rendimiento inmobiliario (reducido)',
      'Otros ingresos',
      'Base imponible total',
      'Tramo marginal %',
      'Cuota total estimada',
      'IRPF que generan los alquileres (informativo)',
      'Retenido en nómina/otros ingresos',
      'Retenido en origen (locales)',
      'Total ya retenido',
      'A guardar',
    ])
    expect(resumen.rows.length).toBeGreaterThan(0)
    const [fila] = resumen.rows
    expect(fila[4]).toBe(
      '=IF(D2=0;19;SUMPRODUCT((D2>\'Tramos IRPF\'!$A$2:$A$7)*(D2<=\'Tramos IRPF\'!$B$2:$B$7)*\'Tramos IRPF\'!$C$2:$C$7))',
    )
    // Cuota total: sobre la base imponible completa (D), no solo sobre lo
    // que generan los alquileres — esto es lo que cambió a petición de Jose.
    expect(fila[5]).toBe(
      '=SUMPRODUCT(IF(D2<=\'Tramos IRPF\'!$A$2:$A$7;0;IF(D2>=\'Tramos IRPF\'!$B$2:$B$7;\'Tramos IRPF\'!$B$2:$B$7-\'Tramos IRPF\'!$A$2:$A$7;D2-\'Tramos IRPF\'!$A$2:$A$7))*\'Tramos IRPF\'!$C$2:$C$7/100)',
    )
    expect(fila[6]).toBe(
      '=MAX(0;F2-SUMPRODUCT(IF(C2<=\'Tramos IRPF\'!$A$2:$A$7;0;IF(C2>=\'Tramos IRPF\'!$B$2:$B$7;\'Tramos IRPF\'!$B$2:$B$7-\'Tramos IRPF\'!$A$2:$A$7;C2-\'Tramos IRPF\'!$A$2:$A$7))*\'Tramos IRPF\'!$C$2:$C$7/100))',
    )
    expect(fila[7]).toBe("=SUM('Ingresos externos'!$D$2:$D$1000)")
    expect(fila[8]).toBe(
      "=SUMIF('Estimador Renta (por propiedad)'!$A:$A;$A2;'Estimador Renta (por propiedad)'!$H:$H)",
    )
    expect(fila[9]).toBe('=H2+I2')
    expect(fila[10]).toBe('=MAX(0;F2-J2)')
  })

  it('Ingresos externos: la retención estimada es una fórmula, no un valor fijo', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'X', tipo: 'piso' })
    const ingresosExternos: IngresoExterno[] = [
      { id: 'i1', nombre: 'Nómina', importeAnual: 24000, porcentajeRetencion: 22, creadoEn: '2025-01-01' },
    ]
    const byTitle = await exportar([p1], [], ingresosExternos)
    const hoja = byTitle.get('Ingresos externos')!
    expect(hoja.headers).toEqual(['Nombre', 'Importe anual', '% Retención', 'Retención estimada'])
    expect(hoja.rows).toEqual([['Nómina', 24000, 22, '=B2*C2/100']])
  })

  it('Evolución anual: matriz año × propiedad, excluye las gestionadas para otros', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'Piso Mayor', tipo: 'piso' })
    const p2 = propiedad({ id: 'p2', nombre: 'Piso de Martín', tipo: 'piso', propietarioNombre: 'Martín' })
    const transacciones = [tx({ propiedadId: 'p1', fecha: '2025-01-05', tipo: 'ingreso', importe: 1000, categoria: 'Alquiler mensual' })]
    const byTitle = await exportar([p1, p2], transacciones, [])
    const evolucion = byTitle.get('Evolución anual')!

    expect(evolucion.headers).toEqual(['Año', 'Piso Mayor', 'Total'])
    const [fila] = evolucion.rows
    expect(fila[0]).toBe('2025')
    expect(fila[1]).toBe(
      '=(SUMIFS(\'Movimientos\'!$F:$F;\'Movimientos\'!$B:$B;B$1;\'Movimientos\'!$D:$D;"Ingreso";\'Movimientos\'!$A:$A;">="&DATE($A2;1;1);\'Movimientos\'!$A:$A;"<="&DATE($A2;12;31))-SUMIFS(\'Movimientos\'!$F:$F;\'Movimientos\'!$B:$B;B$1;\'Movimientos\'!$D:$D;"Gasto";\'Movimientos\'!$A:$A;">="&DATE($A2;1;1);\'Movimientos\'!$A:$A;"<="&DATE($A2;12;31)))*VLOOKUP(B$1;\'Propiedades\'!$A:$G;7;FALSE)/100',
    )
    expect(fila[2]).toBe('=SUM(B2:B2)')
  })

  it('Evolución anual y Estimador Renta excluyen las de uso propio/vivienda habitual', async () => {
    const p1 = propiedad({ id: 'p1', nombre: 'Piso Alquilado', tipo: 'piso' })
    const p2 = propiedad({ id: 'p2', nombre: 'Mi vivienda', tipo: 'piso', estado: 'vivienda_habitual' })
    const byTitle = await exportar([p1, p2], [], [])

    const evolucion = byTitle.get('Evolución anual')!
    expect(evolucion.headers).toEqual(['Año', 'Piso Alquilado', 'Total'])

    const porPropiedad = byTitle.get('Estimador Renta (por propiedad)')!
    expect(porPropiedad.rows.every((r) => r[1] === 'Piso Alquilado')).toBe(true)
  })
})
