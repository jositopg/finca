import { describe, expect, it } from 'vitest'
import type { Propiedad, Tarea, Transaccion } from '../../src/types/index.ts'
import { aplicarEscritura, type ConsultaSql } from './aplicar.ts'
import { ConsultaError } from './consultar.ts'
import { planificar } from './escribir.ts'
import type { Foto } from './foto.ts'

const hoy = new Date(2026, 9, 31)

function finca(parcial: Partial<Propiedad> & Pick<Propiedad, 'id' | 'nombre' | 'tipo'>): Propiedad {
  return {
    direccion: 'Calle',
    estado: 'alquilado',
    folderId: 'carpeta',
    creadoEn: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

function fotoDe(propiedades: Propiedad[], tareas: Tarea[] = [], transacciones: Transaccion[] = []): Foto {
  return { propiedades, transacciones, tareas, ingresosExternos: [] }
}

function gasto(parcial: Partial<Transaccion> = {}): Transaccion {
  return {
    id: 'g1',
    propiedadId: 'p1',
    fecha: '2026-09-01',
    tipo: 'gasto',
    importe: 40,
    categoria: 'Agua',
    descripcion: 'Agua',
    archivos: [],
    creadoEn: '2026-09-01T00:00:00.000Z',
    numeroFactura: 'A12',
    ...parcial,
  }
}

describe('planificar', () => {
  const foto = fotoDe([finca({ id: 'p1', nombre: 'Local Quimel', tipo: 'local' })])

  it('un cobro sin confirmar no trae sentencias que haya que ejecutar', () => {
    const orden = planificar('registrar_cobro', { finca: 'Quimel', importe: '900,00' }, foto, hoy)
    expect(orden.confirmar).toBe(false)
    expect(orden.vista).toMatchObject({
      escrito: false,
      vistaPrevia: true,
      movimiento: {
        finca: 'Local Quimel',
        tipo: 'ingreso',
        categoria: 'Alquiler mensual',
        importe: 900,
        fecha: '2026-10-31',
        periodoInicio: '2026-10-01',
        periodoFin: '2026-10-31',
      },
    })
  })

  it('exige clave para escribir y rechaza una categoría que la app no tiene', () => {
    expect(() => planificar('registrar_cobro', { finca: 'Quimel', importe: 10, confirmar: true }, foto, hoy)).toThrow(
      ConsultaError,
    )
    expect(() =>
      planificar('registrar_gasto', { finca: 'Quimel', importe: 10, categoria: 'Inventada', confirmar: false }, foto, hoy),
    ).toThrow(/no es un gasto/)
  })

  it('el IGIC soportado no cabe en una vivienda', () => {
    const vivienda = fotoDe([finca({ id: 'p2', nombre: 'Piso Rambla', tipo: 'piso' })])
    expect(() =>
      planificar(
        'registrar_gasto',
        { finca: 'Rambla', importe: '40', categoria: 'Reparaciones', igicSoportado: 2.8 },
        vivienda,
        hoy,
      ),
    ).toThrow(/local/)
  })

  it('un gasto sin número de factura se queda como hasta ahora', () => {
    const orden = planificar('registrar_gasto', { finca: 'Quimel', importe: 12, categoria: 'Agua' }, foto, hoy)
    expect(orden.confirmar).toBe(false)
    expect(orden.vista).toMatchObject({
      escrito: false,
      vistaPrevia: true,
      movimiento: {
        finca: 'Local Quimel',
        tipo: 'gasto',
        categoria: 'Agua',
        importe: 12,
        fecha: '2026-10-31',
        periodoInicio: null,
        periodoFin: null,
        numeroFactura: null,
      },
    })
    const conMes = planificar(
      'registrar_gasto',
      { finca: 'Quimel', importe: 12, categoria: 'Agua', mes: '2026-08' },
      foto,
      hoy,
    )
    expect(conMes.vista).toMatchObject({
      movimiento: { periodoInicio: '2026-08-01', periodoFin: '2026-08-31', numeroFactura: null },
    })
  })

  it('guarda número y periodo, rechaza el duplicado en la misma finca y lo permite en otra', () => {
    const orden = planificar(
      'registrar_gasto',
      {
        finca: 'Quimel',
        importe: '30,00',
        categoria: 'Agua',
        numeroFactura: ' a 12 ',
        periodoInicio: '2026-09-01',
        periodoFin: '2026-09-30',
        confirmar: false,
      },
      foto,
      hoy,
    )
    expect(orden.vista).toMatchObject({
      vistaPrevia: true,
      movimiento: { numeroFactura: 'A12', periodoInicio: '2026-09-01', periodoFin: '2026-09-30' },
    })
    expect(orden.sentencias[0].params.at(-1)).toBe('A12')

    const misma = fotoDe(foto.propiedades, [], [gasto({ numeroFactura: 'a 12' })])
    expect(() =>
      planificar(
        'registrar_gasto',
        { finca: 'Quimel', importe: 30, categoria: 'Agua', numeroFactura: 'A12' },
        misma,
        hoy,
      ),
    ).toThrow(/Ya hay una factura A12 en Local Quimel/)

    const dos = fotoDe(
      [finca({ id: 'p1', nombre: 'Local Quimel', tipo: 'local' }), finca({ id: 'p2', nombre: 'Piso Rambla', tipo: 'piso' })],
      [],
      [gasto()],
    )
    const enOtra = planificar(
      'registrar_gasto',
      { finca: 'Rambla', importe: 10, categoria: 'Agua', numeroFactura: 'A12' },
      dos,
      hoy,
    )
    expect(enOtra.vista).toMatchObject({ movimiento: { finca: 'Piso Rambla', numeroFactura: 'A12' } })
  })

  it('rechaza un periodo invertido o a medias', () => {
    expect(() =>
      planificar(
        'registrar_gasto',
        { finca: 'Quimel', importe: 10, categoria: 'Agua', periodoInicio: '2026-10-31', periodoFin: '2026-10-01' },
        foto,
        hoy,
      ),
    ).toThrow(/terminar antes/)
    expect(() =>
      planificar(
        'registrar_gasto',
        { finca: 'Quimel', importe: 10, categoria: 'Agua', periodoInicio: '2026-10-01' },
        foto,
        hoy,
      ),
    ).toThrow(/periodoInicio/)
  })

  it('marca la tarea pendiente que coincide', () => {
    const conTarea = fotoDe(foto.propiedades, [
      {
        id: 't1',
        propiedadId: 'p1',
        titulo: 'Revisar extintor',
        prioridad: 'media',
        estado: 'pendiente',
        creadoEn: '2026-01-01T00:00:00.000Z',
      },
    ])
    const orden = planificar('cerrar_tarea', { finca: 'Quimel', titulo: 'revisar extintor' }, conTarea, hoy)
    expect(orden.vista).toMatchObject({ tarea: { id: 't1', estado: 'hecha' } })
  })
})

describe('aplicarEscritura', () => {
  const foto = fotoDe([finca({ id: 'p1', nombre: 'Local Quimel', tipo: 'local' })])

  function memoria(): ConsultaSql & { guardado?: unknown } {
    const estado: { guardado?: unknown; comenzada: boolean } = { comenzada: false }
    const db: ConsultaSql & { guardado?: unknown } = {
      async query(sql: string, params?: unknown[]) {
        if (sql === 'begin') {
          estado.comenzada = true
          return { rows: [], rowCount: null }
        }
        if (sql === 'commit' || sql === 'rollback') {
          estado.comenzada = false
          return { rows: [], rowCount: null }
        }
        if (sql.startsWith('select resultado')) {
          return { rows: estado.guardado ? [{ resultado: estado.guardado }] : [], rowCount: estado.guardado ? 1 : 0 }
        }
        if (sql.startsWith('insert into agente_escrituras')) {
          estado.guardado = JSON.parse(String(params?.[2]))
          db.guardado = estado.guardado
          return { rows: [], rowCount: 1 }
        }
        if (
          sql.startsWith('insert into transacciones') ||
          sql.startsWith('update tareas') ||
          sql.startsWith('update propiedades') ||
          sql.startsWith('create table')
        ) {
          return { rows: [], rowCount: 1 }
        }
        throw new Error(`sql inesperada: ${sql}`)
      },
    }
    return db
  }

  it('la vista previa no abre la base', async () => {
    const respuesta = await aplicarEscritura('registrar_cobro', { finca: 'Quimel', importe: 900 }, { foto, hoy })
    expect(respuesta).toMatchObject({ escrito: false, vistaPrevia: true })
  })

  it('la misma clave no falla aunque la factura ya esté en la finca', async () => {
    const db = memoria()
    const args = {
      finca: 'Quimel',
      importe: 40,
      categoria: 'Agua',
      numeroFactura: 'A-9',
      periodoInicio: '2026-09-01',
      periodoFin: '2026-09-30',
      confirmar: true,
      clave: 'gasto-agua-a9-ok',
    }
    const primera = await aplicarEscritura('registrar_gasto', args, { foto, hoy, db })
    const segunda = await aplicarEscritura(
      'registrar_gasto',
      args,
      { foto: fotoDe(foto.propiedades, [], [gasto({ numeroFactura: 'A-9' })]), hoy, db },
    )
    expect(primera).toMatchObject({
      escrito: true,
      repetida: false,
      movimiento: { numeroFactura: 'A-9', periodoInicio: '2026-09-01', periodoFin: '2026-09-30' },
    })
    expect(segunda).toMatchObject({ escrito: true, repetida: true, movimiento: (primera as { movimiento: unknown }).movimiento })
  })

  it('la misma clave no inserta dos veces', async () => {
    const db = memoria()
    const args = { finca: 'Quimel', importe: 900, confirmar: true, clave: 'cobro-quimel-2026-10' }
    const primera = await aplicarEscritura('registrar_cobro', args, { foto, hoy, db })
    const segunda = await aplicarEscritura('registrar_cobro', args, { foto, hoy, db })
    expect(primera).toMatchObject({ escrito: true, repetida: false })
    expect(segunda).toMatchObject({ escrito: true, repetida: true, movimiento: (primera as { movimiento: unknown }).movimiento })
  })

  it('fijar_ficha sin confirmar no escribe, y confirmar sin clave falla', async () => {
    const db: ConsultaSql = {
      async query() {
        throw new Error('no debía abrir la base')
      },
    }
    const previa = await aplicarEscritura(
      'fijar_ficha',
      { finca: 'Quimel', campos: { metrosCuadrados: 40, tipoAdquisicion: 'herencia' } },
      { foto, hoy, db },
    )
    expect(previa).toMatchObject({
      escrito: false,
      vistaPrevia: true,
      cambios: [
        { campo: 'tipoAdquisicion', antes: null, despues: 'herencia' },
        { campo: 'metrosCuadrados', antes: null, despues: 40 },
      ],
    })
    expect(() =>
      planificar('fijar_ficha', { finca: 'Quimel', campos: { metrosCuadrados: 40 }, confirmar: true }, foto, hoy),
    ).toThrow(/clave/)
  })

  it('la misma clave no actualiza la ficha dos veces', async () => {
    let updates = 0
    const db = memoria()
    const original = db.query.bind(db)
    db.query = async (sql, params) => {
      if (sql.startsWith('update propiedades')) updates += 1
      return original(sql, params)
    }
    const args = {
      finca: 'Quimel',
      confirmar: true,
      clave: 'ficha-quimel-herencia',
      campos: {
        referenciaCatastral: ' 7837301 vg8173b 0001 tt ',
        tipoAdquisicion: 'herencia',
        fechaAdquisicion: '2018-04-02',
        valorAdquisicion: '90.000,00',
        metrosCuadrados: 80,
        valorMercado: 120000,
        cuotaPropiedad: '1/12',
      },
    }
    const primera = await aplicarEscritura('fijar_ficha', args, { foto, hoy, db })
    const segunda = await aplicarEscritura('fijar_ficha', args, { foto, hoy, db })
    expect(updates).toBe(1)
    expect(primera).toMatchObject({
      escrito: true,
      repetida: false,
      ficha: {
        referenciaCatastral: '7837301VG8173B0001TT',
        tipoAdquisicion: 'herencia',
        fechaAdquisicion: '2018-04-02',
        valorAdquisicion: 90000,
        cuota: { numerador: 1, denominador: 12, valor: 0.083333 },
        valores: { mercado: { total: 120000, parteJose: 10000 }, adquisicion: { total: 90000, parteJose: 7500 } },
      },
    })
    expect(segunda).toMatchObject({ escrito: true, repetida: true, ficha: (primera as { ficha: unknown }).ficha })
  })

  it('rechaza un campo fuera de la lista, una referencia corta y una cuota imposible', () => {
    expect(() => planificar('fijar_ficha', { finca: 'Quimel', campos: { dni: '123' } }, foto, hoy)).toThrow(
      /no es un campo/,
    )
    expect(() =>
      planificar('fijar_ficha', { finca: 'Quimel', campos: { referenciaCatastral: '1234567890123456789' } }, foto, hoy),
    ).toThrow(/20 caracteres/)
    expect(() =>
      planificar('fijar_ficha', { finca: 'Quimel', campos: { referenciaCatastral: '123456789012345678901' } }, foto, hoy),
    ).toThrow(/20 caracteres/)
    expect(() => planificar('fijar_ficha', { finca: 'Quimel', campos: { cuotaPropiedad: 0 } }, foto, hoy)).toThrow(/cuota/)
    expect(() => planificar('fijar_ficha', { finca: 'Quimel', campos: { cuotaPropiedad: '3/2' } }, foto, hoy)).toThrow(
      /cuota/,
    )
    expect(() =>
      planificar('fijar_ficha', { finca: 'Quimel', campos: { copropietarios: [{ nombre: 'Ana', porcentaje: 40, dni: '1' }] } }, foto, hoy),
    ).toThrow(/nombre y porcentaje/)
  })

  it('fijar_ficha alquilerMensual con fechaEfecto abre un tramo y deja la renta anterior en el mes previo', () => {
    const aguagarcia = fotoDe([
      finca({
        id: 'ag4',
        nombre: 'Piso Aguagarcia 4',
        tipo: 'piso',
        estado: 'alquilado',
        alquilerMensual: 498,
        contratoInicio: '2024-01-01',
      }),
    ])
    const orden = planificar(
      'fijar_ficha',
      { finca: 'Aguagarcia 4', campos: { alquilerMensual: 525.77, fechaEfecto: '2026-11-01' } },
      aguagarcia,
      hoy,
    )
    expect(orden.confirmar).toBe(false)
    expect(orden.vista).toMatchObject({
      escrito: false,
      vistaPrevia: true,
      renta: { antes: 498, despues: 525.77, fechaEfecto: '2026-11-01' },
    })
    const ficha = orden.vista.ficha as {
      alquilerMensual: number
      tramosContrato: { vigenteDesde: string; alquilerMensual: number }[]
    }
    expect(ficha.alquilerMensual).toBe(498)
    expect(ficha.tramosContrato).toEqual([
      expect.objectContaining({ vigenteDesde: '2024-01-01', alquilerMensual: 498 }),
      expect.objectContaining({ vigenteDesde: '2026-11-01', alquilerMensual: 525.77 }),
    ])
    expect(orden.sentencias[0].sql).toContain('tramos_contrato')
    expect(orden.sentencias[0].sql).not.toContain('alquiler_mensual')
    expect(JSON.stringify(orden.sentencias[0].params)).toContain('525.77')
    expect(JSON.stringify(orden.sentencias[0].params)).toContain('498')
  })

  it('alquilerMensual sin fechaEfecto falla', () => {
    expect(() =>
      planificar('fijar_ficha', { finca: 'Quimel', campos: { alquilerMensual: 525.77 } }, foto, hoy),
    ).toThrow(/fechaEfecto/)
  })
})
