import { describe, expect, it } from 'vitest'
import { ejecutar } from './consultar.ts'
import type { Foto } from './foto.ts'
import type { Propiedad, Transaccion } from '../../src/types/index.ts'

const HOY = new Date(2026, 9, 29)

function propiedad(overrides: Partial<Propiedad> = {}): Propiedad {
  return {
    id: 'p1',
    nombre: 'Piso test',
    direccion: 'Calle 1',
    tipo: 'piso',
    estado: 'alquilado',
    folderId: 'drive',
    creadoEn: '2026-01-01',
    alquilerMensual: 500,
    contratoInicio: '2026-01-01',
    inquilinoNombre: 'Ana',
    inquilinoDni: '12345678Z',
    inquilinoEmail: 'ana@example.com',
    inquilinoTelefono: '600000000',
    ...overrides,
  }
}

function transaccion(overrides: Partial<Transaccion> = {}): Transaccion {
  return {
    id: 't1',
    propiedadId: 'p1',
    fecha: '2026-10-05',
    tipo: 'ingreso',
    importe: 500,
    categoria: 'Alquiler mensual',
    descripcion: 'octubre',
    archivos: ['drive-file'],
    creadoEn: '2026-10-05T00:00:00.000Z',
    periodoInicio: '2026-10-01',
    periodoFin: '2026-10-31',
    ...overrides,
  }
}

function foto(overrides: Partial<Foto> = {}): Foto {
  return {
    propiedades: [propiedad()],
    transacciones: [],
    tareas: [],
    ingresosExternos: [],
    ...overrides,
  }
}

describe('consultar', () => {
  it('lista la finca sin DNI, email, teléfono ni carpeta de Drive', () => {
    const datos = ejecutar('listar_fincas', {}, foto(), HOY) as { fincas: Record<string, unknown>[] }
    expect(datos.fincas[0]).toMatchObject({
      nombre: 'Piso test',
      inquilino: 'Ana',
      alquilerMensual: 500,
      sinRenta: false,
      cuota: { numerador: 1, denominador: 1, valor: 1 },
    })
    expect(JSON.stringify(datos)).not.toContain('12345678Z')
    expect(JSON.stringify(datos)).not.toContain('ana@example.com')
    expect(JSON.stringify(datos)).not.toContain('600000000')
    expect(JSON.stringify(datos)).not.toContain('drive')
  })

  it('no mete en el resumen la finca de un tercero', () => {
    const datos = ejecutar(
      'resumen',
      { mes: '2026-10' },
      foto({
        propiedades: [
          propiedad(),
          propiedad({ id: 'm', nombre: 'De Martín', propietarioNombre: 'Martín', alquilerMensual: 900 }),
        ],
        transacciones: [
          transaccion(),
          transaccion({ id: 'tm', propiedadId: 'm', importe: 900 }),
        ],
      }),
      HOY,
    ) as { ingresos: number; porFinca: { nombre: string }[] }
    expect(datos.ingresos).toBe(500)
    expect(datos.porFinca.map((f) => f.nombre)).toEqual(['Piso test'])
  })

  it('marca la renta de octubre como pendiente si no hay cobro', () => {
    const datos = ejecutar('cobros_pendientes', { mes: '2026-10' }, foto(), HOY) as {
      pendientes: { nombre: string; esperado: number; falta: number }[]
    }
    expect(datos.pendientes).toEqual([{ id: 'p1', nombre: 'Piso test', inquilino: 'Ana', esperado: 500, cobrado: 0, falta: 500 }])
  })

  it('devenga el IGIC de octubre en un local aunque no esté cobrado', () => {
    const datos = ejecutar(
      'modelo_420',
      { anio: '2026', trimestre: 4 },
      foto({
        propiedades: [
          propiedad({
            id: 'loc',
            nombre: 'Local Quimel',
            tipo: 'local',
            alquilerMensual: 1000,
          }),
        ],
      }),
      HOY,
    ) as { base: number; igic: number; locales: { mesesSinCobrar: string[] }[] }
    expect(datos.base).toBe(1000)
    expect(datos.igic).toBe(70)
    expect(datos.locales[0].mesesSinCobrar).toEqual(['2026-10'])
  })

  it('pide el nombre completo si hay varias fincas parecidas', () => {
    const base = foto({
      propiedades: [
        propiedad({ id: 'a1', nombre: 'Piso Aguagarcia 1' }),
        propiedad({ id: 'a2', nombre: 'Piso Aguagarcia 2' }),
      ],
    })
    expect(() => ejecutar('movimientos', { finca: 'Aguagarcia' }, base, HOY)).toThrow(/varias fincas/)
    const datos = ejecutar(
      'movimientos',
      { finca: 'Aguagarcia 2', desde: '2026-10-01', hasta: '2026-10-31' },
      foto({
        propiedades: base.propiedades,
        transacciones: [transaccion({ id: 'ta', propiedadId: 'a2', archivos: ['secreto-drive'] })],
      }),
      HOY,
    ) as { finca: string }
    expect(datos.finca).toBe('Piso Aguagarcia 2')
    expect(JSON.stringify(datos)).not.toContain('secreto-drive')
  })

  it('devuelve la herencia guardada y no DNI, email, teléfono ni NIF', () => {
    const datos = ejecutar(
      'listar_fincas',
      {},
      foto({
        propiedades: [
          propiedad({
            tipoAdquisicion: 'herencia',
            fechaAdquisicion: '2018-04-02',
            valorAdquisicion: 90000,
            referenciaCatastral: '7837301VG8173B0001TT',
            metrosCuadrados: 80,
            valorMercado: 120000,
            fechaValorMercado: '2026-01-15',
            valorReferencia: 80000,
            valorConstruccion: 40000,
            cuotaPropiedad: { numerador: 1, denominador: 12, valor: 0.083333 },
            copropietarios: [{ nombre: 'Luis', porcentaje: 100, nif: 'B123' } as never],
          }),
        ],
      }),
      HOY,
    ) as { fincas: Record<string, unknown>[] }
    expect(datos.fincas[0]).toMatchObject({
      tipoAdquisicion: 'herencia',
      fechaAdquisicion: '2018-04-02',
      valorAdquisicion: 90000,
      referenciaCatastral: '7837301VG8173B0001TT',
      metrosCuadrados: 80,
      valorMercado: 120000,
      valores: {
        mercado: { total: 120000, parteJose: 10000 },
        adquisicion: { total: 90000, parteJose: 7500 },
      },
      copropietarios: [{ nombre: 'Luis', porcentaje: 100 }],
    })
    const json = JSON.stringify(datos)
    expect(json).not.toContain('12345678Z')
    expect(json).not.toContain('ana@example.com')
    expect(json).not.toContain('600000000')
    expect(json).not.toContain('B123')
    expect(json).not.toContain('nif')
  })

  it('un rústico sin renta sale en el listado y no en cobros, huecos ni avisos', () => {
    const base = foto({
      propiedades: [
        propiedad({
          id: 'rus',
          nombre: 'Finca rústica',
          tipo: 'rustica',
          estado: 'alquilado',
          sinRenta: true,
          alquilerMensual: 400,
          contratoInicio: '2020-01-01',
          valorMercado: 50000,
          fianzaImporte: 400,
        }),
      ],
    })
    const lista = ejecutar('listar_fincas', {}, base, HOY) as { fincas: { nombre: string; sinRenta: boolean }[] }
    expect(lista.fincas).toEqual([expect.objectContaining({ nombre: 'Finca rústica', sinRenta: true, tipo: 'rustica' })])
    const cobros = ejecutar('cobros_pendientes', { mes: '2026-10' }, base, HOY) as { pendientes: unknown[]; deudas: unknown[] }
    expect(cobros.pendientes).toEqual([])
    expect(cobros.deudas).toEqual([])
    const huecos = ejecutar('huecos', {}, base, HOY) as { huecos: unknown[] }
    expect(huecos.huecos).toEqual([])
    const avisos = ejecutar('avisos', {}, base, HOY) as { avisos: { tipo: string }[] }
    expect(avisos.avisos.filter((a) => a.tipo === 'renta' || a.tipo === 'registro' || a.tipo === 'fianza')).toEqual([])
  })
})
