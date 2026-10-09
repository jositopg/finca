import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { describe, expect, it } from 'vitest'
import {
  calcularRentaLocal,
  rangoMesCivil,
  type Propiedad,
  type Transaccion,
} from './index'
import {
  construirCobroRenta,
  filaCobroLote,
  propiedadesYaCobradas,
} from './cobroRenta'

function propiedad(overrides: Partial<Propiedad> = {}): Propiedad {
  return {
    id: 'p1',
    nombre: 'Piso test',
    direccion: '',
    tipo: 'piso',
    estado: 'alquilado',
    folderId: '',
    creadoEn: '2026-01-01',
    alquilerMensual: 650,
    contratoInicio: '2026-10-01',
    inquilinoNombre: 'Ana',
    ...overrides,
  }
}

function transaccion(overrides: Partial<Transaccion> = {}): Transaccion {
  return {
    id: crypto.randomUUID(),
    propiedadId: 'p1',
    fecha: '2026-10-05',
    tipo: 'ingreso',
    importe: 100,
    categoria: 'Alquiler mensual',
    descripcion: '',
    archivos: [],
    creadoEn: '2026-10-05T00:00:00.000Z',
    ...overrides,
  }
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Copia literal de cómo CobroRenta.handleConfirm montaba la tx en 260ecac.
function construccionAnterior(
  propiedadCobro: Pick<Propiedad, 'id' | 'tipo'>,
  mesPagado: string,
  fecha: string,
  rentaBruta: number,
  alquiler: number,
  id: string,
  creadoEn: string,
): Transaccion {
  const esLocal = propiedadCobro.tipo === 'local'
  const desglose = esLocal ? calcularRentaLocal(rentaBruta) : null
  const importe = desglose ? desglose.neta : alquiler
  const periodo = rangoMesCivil(mesPagado)
  const mesTexto = format(new Date(`${periodo.inicio}T00:00:00`), 'MMMM yyyy', { locale: es })
  const descripcion = desglose
    ? `${mesTexto} · Base ${fmt(desglose.base)} € · IGIC +${fmt(desglose.igic)} € · IRPF -${fmt(desglose.irpf)} €`
    : mesTexto
  const tx: Transaccion = {
    id,
    propiedadId: propiedadCobro.id,
    fecha,
    tipo: 'ingreso',
    importe,
    categoria: 'Alquiler mensual',
    descripcion,
    archivos: [],
    creadoEn,
    periodoInicio: periodo.inicio,
    periodoFin: periodo.fin,
  }
  return tx
}

describe('construirCobroRenta', () => {
  const id = 'id-fijo'
  const creadoEn = '2026-10-07T10:00:00.000Z'
  const fecha = '2026-10-07'

  it('coincide en datos con la construcción anterior de CobroRenta', () => {
    const casos: { tipo: Propiedad['tipo']; renta: number; mes: string }[] = [
      { tipo: 'piso', renta: 650, mes: '2026-10' },
      { tipo: 'piso', renta: 650, mes: '2026-02' },
      { tipo: 'garaje', renta: 80, mes: '2026-10' },
      { tipo: 'garaje', renta: 80, mes: '2026-02' },
      { tipo: 'local', renta: 1000, mes: '2026-10' },
      { tipo: 'local', renta: 1000, mes: '2026-02' },
      { tipo: 'local', renta: 333.33, mes: '2026-10' },
      { tipo: 'local', renta: 333.33, mes: '2026-02' },
    ]
    for (const caso of casos) {
      const prop = { id: 'p1', tipo: caso.tipo }
      expect(
        construirCobroRenta({
          propiedad: prop,
          mesPagado: caso.mes,
          fecha,
          rentaBruta: caso.renta,
          id,
          creadoEn,
        }),
      ).toEqual(construccionAnterior(prop, caso.mes, fecha, caso.renta, caso.renta, id, creadoEn))
    }
  })

  it('guarda la neta sin redondear en un local de 333,33 €', () => {
    const tx = construirCobroRenta({
      propiedad: { id: 'p1', tipo: 'local' },
      mesPagado: '2026-10',
      fecha,
      rentaBruta: 333.33,
      id,
      creadoEn,
    })
    expect(tx.importe).toBe(293.3304)
  })

  it('describe un local de 1000 € en octubre y cierra febrero el día 28', () => {
    const octubre = construirCobroRenta({
      propiedad: { id: 'p1', tipo: 'local' },
      mesPagado: '2026-10',
      fecha,
      rentaBruta: 1000,
      id,
      creadoEn,
    })
    expect(octubre.descripcion).toBe(
      'octubre 2026 · Base 1000,00 € · IGIC +70,00 € · IRPF -190,00 €',
    )
    expect(octubre.importe).toBe(880)
    expect(octubre.periodoFin).toBe('2026-10-31')

    const febrero = construirCobroRenta({
      propiedad: { id: 'p1', tipo: 'local' },
      mesPagado: '2026-02',
      fecha: '2026-02-07',
      rentaBruta: 1000,
      id,
      creadoEn,
    })
    expect(febrero.periodoFin).toBe('2026-02-28')
  })
})

describe('filaCobroLote', () => {
  const hoy = new Date(2026, 9, 7)

  it('deja sin motivos un contrato que empieza este mes y no tiene cobros', () => {
    const fila = filaCobroLote(propiedad(), [], hoy)
    expect(fila.motivos).toEqual([])
    expect(fila.mesPagado).toBe('2026-10')
    expect(fila.importe).toBe(650)
  })

  it('marca cambio cuando hay un tramo nuevo a mitad de mes', () => {
    const fila = filaCobroLote(
      propiedad({
        alquilerMensual: 700,
        tramosContrato: [
          { id: 'a', vigenteDesde: '2026-10-01', alquilerMensual: 650 },
          { id: 'b', vigenteDesde: '2026-10-15', alquilerMensual: 700 },
        ],
      }),
      [],
      hoy,
    )
    expect(fila.motivos).toEqual(['cambio'])
    expect(fila.mesPagado).toBe('2026-10')
  })

  it('marca cambio si el contrato se sustituye a mitad de mes', () => {
    const fila = filaCobroLote(
      propiedad({
        alquilerMensual: 700,
        contratoInicio: '2026-10-15',
        historialContratos: [
          {
            id: 'h1',
            inquilinoNombre: 'Ana',
            alquilerMensual: 500,
            fechaInicio: '2026-10-01',
            fechaFin: '2026-10-14',
          },
        ],
      }),
      [],
      hoy,
    )
    expect(fila.motivos).toEqual(['cambio'])
    expect(fila.rentaBruta).toBe(500)
  })

  it('marca cobro parcial cuando ese mes ya tiene 100 €', () => {
    const fila = filaCobroLote(
      propiedad(),
      [
        transaccion({
          importe: 100,
          periodoInicio: '2026-10-01',
          periodoFin: '2026-10-31',
        }),
      ],
      hoy,
    )
    expect(fila.motivos).toEqual(['parcial'])
    expect(fila.cobradoAlAbrir).toBe(100)
  })

  it('marca deuda y mes atrasado si el contrato empezó hace dos meses sin cobros', () => {
    const fila = filaCobroLote(propiedad({ contratoInicio: '2026-08-01' }), [], hoy)
    expect(fila.motivos).toEqual(['deuda', 'atrasado'])
    expect(fila.mesPagado).toBe('2026-08')
  })
})

describe('propiedadesYaCobradas', () => {
  const hoy = new Date(2026, 9, 7)

  it('detecta un cobro nuevo en una fila limpia y no salta un parcial ya conocido', () => {
    const limpia = filaCobroLote(propiedad(), [], hoy)
    const cobroNuevo = transaccion({
      importe: 650,
      periodoInicio: '2026-10-01',
      periodoFin: '2026-10-31',
    })
    expect(propiedadesYaCobradas([limpia], [cobroNuevo]).has('p1')).toBe(true)

    const parcialConocido = transaccion({
      id: 'c1',
      importe: 100,
      periodoInicio: '2026-10-01',
      periodoFin: '2026-10-31',
    })
    const filaParcial = filaCobroLote(propiedad(), [parcialConocido], hoy)
    expect(propiedadesYaCobradas([filaParcial], [parcialConocido]).has('p1')).toBe(false)

    const extra = transaccion({
      id: 'c2',
      importe: 50,
      periodoInicio: '2026-10-01',
      periodoFin: '2026-10-31',
    })
    expect(propiedadesYaCobradas([filaParcial], [parcialConocido, extra]).has('p1')).toBe(true)
  })
})
