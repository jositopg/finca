import { Client, types as pgTypes } from 'pg'
import type { IngresoExterno, Propiedad, Tarea, Transaccion } from '../../src/types/index.ts'
import { cargarEnv } from './env.ts'
import { filaAIngresoExterno, filaAPropiedad, filaATarea, filaATransaccion } from './filas.ts'

// `date` y timestamps llegan como texto. El parser por defecto de node-pg
// convierte un date a medianoche local y un día puede cambiar de mes.
pgTypes.setTypeParser(1082, (valor) => valor)
pgTypes.setTypeParser(1114, (valor) => valor)
pgTypes.setTypeParser(1184, (valor) => valor)

export interface Foto {
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  tareas: Tarea[]
  ingresosExternos: IngresoExterno[]
}

export async function cargarFoto(): Promise<Foto> {
  cargarEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL en ~/.finca-db.env')

  const cliente = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await cliente.connect()
  try {
    const propiedades = await cliente.query('select * from propiedades')
    const transacciones = await cliente.query('select * from transacciones')
    const tareas = await cliente.query('select * from tareas')
    const ingresos = await cliente.query('select * from ingresos_externos')
    return {
      propiedades: propiedades.rows.map((fila) => filaAPropiedad(fila)),
      transacciones: transacciones.rows.map((fila) => filaATransaccion(fila)),
      tareas: tareas.rows.map((fila) => filaATarea(fila)),
      ingresosExternos: ingresos.rows.map((fila) => filaAIngresoExterno(fila)),
    }
  } finally {
    await cliente.end()
  }
}
