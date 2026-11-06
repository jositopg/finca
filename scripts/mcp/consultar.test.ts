import { describe, expect, it } from 'vitest'
import { ejecutar } from './consultar.ts'
import type { Foto } from './foto.ts'
import {
  rangoAnio,
  rangoUltimosMeses,
  rentabilidadCartera,
  rentabilidadEnRango,
  resumenIrpf,
  type Propiedad,
  type RentabilidadPeriodo,
  type ResumenIrpfAnio,
  type Transaccion,
} from '../../src/types/index.ts'

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

  it('devuelve contrato, fianza, vencimientos y enlaces cuando existen', () => {
    const datos = ejecutar(
      'listar_fincas',
      {},
      foto({
        propiedades: [
          propiedad({
            contratoInicio: '2025-11-01',
            contratoFin: '2026-12-01',
            alquilerMensual: 700,
            tramosContrato: [
              {
                id: 't1',
                vigenteDesde: '2025-11-01',
                alquilerMensual: 650,
                contratoFin: '2026-08-31',
                fianzaImporte: 650,
              },
              {
                id: 't2',
                vigenteDesde: '2026-09-01',
                alquilerMensual: 700,
                contratoFin: '2026-12-01',
                fianzaImporte: 700,
                notas: 'NOTA-SECRETA 600111222',
              },
            ],
            fianzaImporte: 700,
            fianzaDepositadaDesde: '2025-11-02T10:00:00.000Z',
            fianzaDepositoNumero: 'ICAVI-99',
            seguroVencimiento: '2026-12-20',
            certificadoEnergeticoVencimiento: '2026-11-20',
            ibiMes: 9,
            contratoArchivoId: 'contratoArchivo',
            contratoArchivoNombre: 'contrato-ana.pdf',
            fianzaDepositoArchivoId: 'fianzaArchivo',
            fianzaDepositoArchivoNombre: 'resguardo.pdf',
            copropietarios: [{ nombre: 'Luis', porcentaje: 100, nif: 'B12345678' } as never],
          }),
        ],
        transacciones: [
          transaccion({
            id: 'tarde',
            archivos: ['facturaUno', 'facturaUno'],
            fecha: '2026-10-05',
            creadoEn: '2026-10-05T00:00:00.000Z',
          }),
          transaccion({
            id: 'pronto',
            archivos: ['facturaDos'],
            fecha: '2026-09-01',
            creadoEn: '2026-09-01T00:00:00.000Z',
          }),
          transaccion({ id: 'ajena', propiedadId: 'otra', archivos: ['facturaAjena'] }),
        ],
      }),
      HOY,
    ) as { fincas: Record<string, unknown>[] }
    expect(datos.fincas[0]).toMatchObject({
      contratoInicio: '2025-11-01',
      contratoFin: '2026-12-01',
      alquilerMensual: 700,
      tramosContrato: [
        { id: 't1', vigenteDesde: '2025-11-01', alquilerMensual: 650, contratoFin: '2026-08-31', fianzaImporte: 650 },
        { id: 't2', vigenteDesde: '2026-09-01', alquilerMensual: 700, contratoFin: '2026-12-01', fianzaImporte: 700 },
      ],
      fianzaImporte: 700,
      fianzaDepositadaDesde: '2025-11-02T10:00:00.000Z',
      fianzaDepositoNumero: 'ICAVI-99',
      seguroVencimiento: '2026-12-20',
      revisionRenta: { fecha: '2026-11-01', tipo: 'anual' },
      certificadoEnergeticoVencimiento: '2026-11-20',
      ibiMes: 9,
      enlaces: {
        contrato: 'https://drive.google.com/file/d/contratoArchivo/view',
        fianza: 'https://drive.google.com/file/d/fianzaArchivo/view',
        facturas: [
          'https://drive.google.com/file/d/facturaDos/view',
          'https://drive.google.com/file/d/facturaUno/view',
        ],
      },
      avisosVencimiento: [
        { tipo: 'contrato', fecha: '2026-12-01', dias: 33, mensaje: 'Contrato vence en 33 días' },
        { tipo: 'revision', fecha: '2026-11-01', dias: 3, mensaje: 'Revisión de renta en 3 días' },
        { tipo: 'cee', fecha: '2026-11-20', dias: 22, mensaje: 'CEE vence en 22 días' },
        { tipo: 'seguro', fecha: '2026-12-20', dias: 52, mensaje: 'Seguro vence en 52 días' },
      ],
    })
    const ficha = datos.fincas[0]
    expect(ficha).not.toHaveProperty('contratoArchivoId')
    expect(ficha).not.toHaveProperty('folderId')
    expect(ficha).not.toHaveProperty('inquilinoDni')
    expect(ficha).not.toHaveProperty('inquilinoEmail')
    expect(ficha).not.toHaveProperty('inquilinoTelefono')
    const json = JSON.stringify(datos)
    expect(json).not.toContain('12345678Z')
    expect(json).not.toContain('ana@example.com')
    expect(json).not.toContain('600000000')
    expect(json).not.toContain('600111222')
    expect(json).not.toContain('NOTA-SECRETA')
    expect(json).not.toContain('B12345678')
    expect(json).not.toContain('nif')
    expect(json).not.toContain('contrato-ana.pdf')
    expect(json).not.toContain('resguardo.pdf')
    expect(json).not.toContain('facturaAjena')
    expect(json).not.toContain('"contratoArchivo"')
  })

  it('omite contrato, fianza, vencimientos y enlaces cuando no están', () => {
    const datos = ejecutar(
      'listar_fincas',
      {},
      foto({
        propiedades: [
          propiedad({
            id: 'vacia',
            nombre: 'Garaje vacío',
            estado: 'vacio',
            alquilerMensual: undefined,
            contratoInicio: undefined,
            inquilinoNombre: undefined,
            inquilinoDni: undefined,
            inquilinoEmail: undefined,
            inquilinoTelefono: undefined,
            seguroVencimiento: '2027-06-01',
            certificadoEnergeticoVencimiento: '2026-12-29',
          }),
          propiedad({
            id: 'justo',
            nombre: 'Justo sesenta',
            contratoInicio: '2026-10-01',
            contratoFin: '2026-12-28',
            alquilerMensual: 400,
          }),
          propiedad({
            id: 'atrasada',
            nombre: 'Revisión atrasada',
            contratoInicio: '2024-03-01',
            alquilerMensual: 400,
            rentaRevisadaDesde: undefined,
          }),
          propiedad({
            id: 'revisada',
            nombre: 'Revisión hecha',
            contratoInicio: '2024-03-01',
            alquilerMensual: 400,
            rentaRevisadaDesde: '2026-03-02T00:00:00',
          }),
        ],
      }),
      HOY,
    ) as { fincas: Record<string, unknown>[] }
    const porNombre = Object.fromEntries(datos.fincas.map((f) => [f.nombre, f]))
    const vacia = porNombre['Garaje vacío']
    for (const clave of [
      'contratoInicio',
      'contratoFin',
      'tramosContrato',
      'fianzaImporte',
      'fianzaDepositadaDesde',
      'fianzaDepositoNumero',
      'revisionRenta',
      'ibiMes',
      'enlaces',
      'avisosVencimiento',
    ]) {
      expect(vacia).not.toHaveProperty(clave)
    }
    expect(vacia).toMatchObject({
      alquilerMensual: null,
      inquilino: null,
      seguroVencimiento: '2027-06-01',
      certificadoEnergeticoVencimiento: '2026-12-29',
    })
    expect(JSON.stringify(vacia)).not.toContain('drive')
    expect(JSON.stringify(vacia)).not.toContain('12345678Z')

    expect(porNombre['Justo sesenta']).toMatchObject({
      contratoFin: '2026-12-28',
      revisionRenta: { fecha: '2027-10-01', tipo: 'anual' },
      avisosVencimiento: [{ tipo: 'contrato', fecha: '2026-12-28', dias: 60, mensaje: 'Contrato vence en 60 días' }],
    })
    expect(porNombre['Justo sesenta']).not.toHaveProperty('fianzaImporte')

    const atrasada = porNombre['Revisión atrasada']
    expect(atrasada.revisionRenta).toEqual({ fecha: '2025-03-01', tipo: 'anual' })
    expect(atrasada.avisosVencimiento).toEqual([
      expect.objectContaining({
        tipo: 'revision',
        fecha: '2025-03-01',
        mensaje: 'Toca revisar la renta (IPC/IGC)',
      }),
    ])
    expect((atrasada.avisosVencimiento as { dias: number }[])[0].dias).toBeLessThan(0)

    expect(porNombre['Revisión hecha']).toMatchObject({ revisionRenta: { fecha: '2027-03-01', tipo: 'anual' } })
    expect(porNombre['Revisión hecha']).not.toHaveProperty('avisosVencimiento')
  })

  it('la rentabilidad coincide con la app y no lleva datos personales', () => {
    const hoy = new Date(2026, 10, 3)
    const piso = propiedad({
      estado: 'vacio',
      contratoInicio: '2026-01-01',
      contratoFin: '2026-06-30',
      valorMercado: 100000,
      valorReferencia: 50000,
    })
    const sinValor = propiedad({
      id: 'sv',
      nombre: 'Sin valor',
      estado: 'vacio',
      valorMercado: undefined,
      valorReferencia: 80000,
      contratoInicio: undefined,
    })
    const ajena = propiedad({
      id: 'aj',
      nombre: 'De Martín',
      propietarioNombre: 'Martín',
      valorMercado: 90000,
    })
    const txs = [
      transaccion({ importe: 6000, fecha: '2026-03-05', periodoInicio: undefined, periodoFin: undefined }),
      transaccion({
        id: 'fianza',
        categoria: 'Fianza recibida',
        importe: 6000,
        fecha: '2026-01-05',
        periodoInicio: undefined,
        periodoFin: undefined,
      }),
      transaccion({
        id: 'gasto',
        tipo: 'gasto',
        categoria: 'Comunidad de propietarios',
        importe: 1000,
        fecha: '2026-04-02',
        periodoInicio: undefined,
        periodoFin: undefined,
      }),
    ]
    const datos = ejecutar('rentabilidad', { anio: '2026' }, foto({ propiedades: [piso, sinValor, ajena], transacciones: txs }), hoy) as {
      hoy: string
      anio: RentabilidadPeriodo & { anio: string }
      ultimos12Meses: RentabilidadPeriodo
    }
    const [desde, hasta] = rangoAnio('2026')
    const anio = rentabilidadCartera([piso, sinValor, ajena], txs, desde, hasta, hoy)
    const ventana = rangoUltimosMeses(hoy)
    const ultimos = rentabilidadCartera([piso, sinValor, ajena], txs, ventana.desde, ventana.hasta, hoy)
    expect(datos.hoy).toBe('2026-11-03')
    expect(datos.anio.anio).toBe('2026')
    expect(datos.anio.porFinca).toEqual(anio.porFinca)
    expect(datos.anio.total).toEqual(anio.total)
    expect(datos.ultimos12Meses.porFinca).toEqual(ultimos.porFinca)
    expect(datos.ultimos12Meses.total).toEqual(ultimos.total)
    const fila = anio.porFinca.find((f) => f.nombre === 'Piso test')!
    const directa = rentabilidadEnRango(piso, txs, desde, hasta, hoy)
    expect(fila.bruta).toBe(directa.bruta)
    expect(fila.neta).toBe(directa.neta)
    expect(fila.mesesVacios).toBe(5)
    expect(fila.rentas).toBe(6000)
    expect(fila.gastos).toBe(1000)
    expect(fila.bruta).toBeCloseTo(6, 6)
    expect(fila.neta).toBeCloseTo(5, 6)
    expect(anio.porFinca.find((f) => f.nombre === 'Sin valor')).toMatchObject({
      bruta: null,
      neta: null,
      motivo: 'Sin valor de mercado.',
    })
    expect(anio.porFinca.map((f) => f.nombre)).not.toContain('De Martín')
    const json = JSON.stringify(datos)
    expect(json).not.toContain('12345678Z')
    expect(json).not.toContain('ana@example.com')
    expect(json).not.toContain('600000000')
    expect(json).not.toContain('drive')
    expect(json).not.toContain('nif')
  })

  it("rentabilidad con grupo 'Av. Venezuela' suma solo sus 4 inmuebles y da subtotal", () => {
    const hoy = new Date(2026, 10, 3)
    const cuota = { numerador: 1, denominador: 2, valor: 0.5 }
    const unidad = (id: string, nombre: string, tipo: Propiedad['tipo'], renta: number): Propiedad =>
      propiedad({
        id,
        nombre,
        tipo,
        estado: 'alquilado',
        contratoInicio: '2020-01-01',
        grupo: 'Av. Venezuela',
        cuotaPropiedad: cuota,
        valorMercado: 100000,
        alquilerMensual: renta,
      })
    const local = unidad('v1', 'Venezuela local', 'local', 400)
    const piso1 = unidad('v2', 'Venezuela piso 1', 'piso', 300)
    const piso2 = unidad('v3', 'Venezuela piso 2', 'piso', 200)
    const piso3 = unidad('v4', 'Venezuela piso 3', 'piso', 100)
    const otra = propiedad({
      id: 'otra',
      nombre: 'Otra finca',
      estado: 'alquilado',
      contratoInicio: '2020-01-01',
      grupo: 'Otro',
      valorMercado: 200000,
      alquilerMensual: 900,
    })
    const txs = [local, piso1, piso2, piso3, otra].map((p) =>
      transaccion({
        id: `t-${p.id}`,
        propiedadId: p.id,
        importe: p.alquilerMensual ?? 0,
        fecha: '2026-03-05',
        periodoInicio: undefined,
        periodoFin: undefined,
      }),
    )
    const datos = ejecutar(
      'rentabilidad',
      { anio: '2026', grupo: 'Av. Venezuela' },
      foto({ propiedades: [local, piso1, piso2, piso3, otra], transacciones: txs }),
      hoy,
    ) as {
      anio: RentabilidadPeriodo & {
        subtotales: ({ grupo: string } & RentabilidadPeriodo)[]
      }
    }
    expect(datos.anio.porFinca).toHaveLength(4)
    expect(datos.anio.porFinca.map((f) => f.nombre)).not.toContain('Otra finca')
    const rentas = datos.anio.porFinca.reduce((s, f) => s + f.rentas, 0)
    expect(rentas).toBe(1000)
    expect(datos.anio.total.rentas).toBe(1000)
    expect(datos.anio.subtotales).toEqual([
      expect.objectContaining({
        grupo: 'Av. Venezuela',
        total: expect.objectContaining({ rentas: 1000 }),
      }),
    ])
    expect(datos.anio.subtotales[0].porFinca).toHaveLength(4)
  })

  it('el resumen de IRPF coincide con la app, redondea a céntimos y no lleva datos personales', () => {
    const piso = propiedad({
      tipo: 'piso',
      valorConstruccion: 10000,
      contratoInicio: '2020-01-01',
      porcentajePropiedad: 50,
    })
    const txs = [
      transaccion({
        importe: 1000,
        fecha: '2026-03-05',
        periodoInicio: undefined,
        periodoFin: undefined,
      }),
      transaccion({
        id: 'rep',
        tipo: 'gasto',
        categoria: 'Reparaciones',
        importe: 1800,
        fecha: '2026-04-01',
        periodoInicio: undefined,
        periodoFin: undefined,
      }),
    ]
    const datos = ejecutar('resumen_irpf', { anio: '2026' }, foto({ propiedades: [piso], transacciones: txs }), HOY) as ResumenIrpfAnio
    const app = resumenIrpf([piso], txs, '2026')
    expect(datos.nota).toMatch(/orientativo/i)
    expect(datos.nota).toMatch(/declaración/)
    expect(datos.anio).toBe('2026')
    expect(datos.porFinca).toEqual(app.porFinca)
    expect(datos.totales).toEqual(app.totales)
    expect(app.porFinca[0].ingresosIntegros).toBe(500)
    expect(app.porFinca[0].excesoAnio).toBe(400)
    expect(app.porFinca[0].gastosDeducibles).toBe(500)
    expect(app.porFinca[0].amortizacion).toBe(150)
    const json = JSON.stringify(datos)
    expect(json).not.toContain('12345678Z')
    expect(json).not.toContain('ana@example.com')
    expect(json).not.toContain('600000000')
    expect(json).not.toContain('drive')
    expect(json).not.toContain('nif')
  })

  it('un solar imputa 0', () => {
    const solar = propiedad({
      id: 'solar',
      nombre: 'Solar tacoronte',
      tipo: 'otro',
      estado: 'uso_propio',
      contratoInicio: undefined,
      valorCatastral: 100000,
    })
    const datos = ejecutar('resumen_irpf', { anio: '2026' }, foto({ propiedades: [solar] }), HOY) as ResumenIrpfAnio
    expect(datos.imputaciones[0]).toMatchObject({
      nombre: 'Solar tacoronte',
      estado: 'calculada',
      importe: 0,
      tipo: 2,
      provisional: true,
    })
  })

  it('la base de amortización usa la proporción y la mayor de las dos', () => {
    const piso = propiedad({
      nombre: 'Con proporción',
      estado: 'alquilado',
      contratoInicio: '2020-01-01',
      valorConstruccion: 40000,
      valorCatastral: 100000,
      valorAdquisicion: 200000,
    })
    const datos = ejecutar('resumen_irpf', { anio: '2026' }, foto({ propiedades: [piso] }), HOY) as ResumenIrpfAnio
    expect(datos.porFinca[0].baseAmortizacion).toBe(80000)
    expect(datos.porFinca[0].amortizacion).toBe(2400)
    expect(datos.porFinca[0].pendiente).not.toContain('proporción de construcción')
  })

  it('los totales suman aunque falte una finca y la listan en pendientes', () => {
    const alquila = propiedad({
      id: 'alquila',
      nombre: 'Alquila',
      estado: 'alquilado',
      contratoInicio: '2020-01-01',
      valorConstruccion: 10000,
    })
    const imputa = propiedad({
      id: 'imputa',
      nombre: 'Imputa',
      tipo: 'garaje',
      estado: 'vacio',
      sinRenta: true,
      contratoInicio: undefined,
      valorCatastral: 100000,
      anioRevisionCatastral: 2020,
    })
    const falta = propiedad({
      id: 'falta',
      nombre: 'Falta',
      estado: 'vacio',
      sinRenta: true,
      contratoInicio: undefined,
    })
    const datos = ejecutar(
      'resumen_irpf',
      { anio: '2026' },
      foto({ propiedades: [alquila, imputa, falta] }),
      HOY,
    ) as ResumenIrpfAnio
    expect(datos.totales.amortizacion).toBe(300)
    expect(datos.totales.imputacion).toBe(1100)
    expect(datos.totales.pendientes).toEqual([{ finca: 'Falta', motivo: 'valor catastral' }])
  })

  it('subtotalesPorGrupo es {} sin grupos', () => {
    const datos = ejecutar('rentabilidad', { anio: '2026' }, foto(), HOY) as {
      anio: { subtotalesPorGrupo: Record<string, unknown> }
      ultimos12Meses: { subtotalesPorGrupo: Record<string, unknown> }
    }
    expect(datos.anio.subtotalesPorGrupo).toEqual({})
    expect(datos.ultimos12Meses.subtotalesPorGrupo).toEqual({})
  })
})
