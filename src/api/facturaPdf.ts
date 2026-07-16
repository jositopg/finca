import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  baseDesdeRentaNeta,
  calcularRentaLocal,
  tipoDocumentoAlquiler,
  type DatosFacturacion,
  type Propiedad,
  type Transaccion,
} from '../types'

const MARGIN = 20
const PAGE_WIDTH = 210
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const COL_WIDTH = CONTENT_WIDTH / 2 - 5

function fmtEUR(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

// jsPDF pesa lo suyo — se carga solo cuando hace falta (al abrir una
// factura), no en el bundle principal de la app.
export async function generarFacturaPDF(
  tx: Transaccion,
  propiedad: Propiedad,
  datosFacturacion: DatosFacturacion,
) {
  const { jsPDF } = await import('jspdf')

  const tipoDoc = tipoDocumentoAlquiler(propiedad)
  const esFactura = tipoDoc === 'F'
  const desglose = propiedad.tipo === 'local' ? calcularRentaLocal(baseDesdeRentaNeta(tx.importe)) : null
  const hoy = new Date()
  const fechaTx = parseISO(tx.fecha)

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // Cabecera
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(20)
  doc.text(esFactura ? 'FACTURA' : 'RECIBO DE ALQUILER', MARGIN, 30)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(130)
  doc.text(`Nº ${tx.numeroFactura ?? '(pendiente de generar)'}`, MARGIN, 37)

  doc.setFontSize(9)
  doc.text('Fecha de emisión', PAGE_WIDTH - MARGIN, 26, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(20)
  doc.text(format(hoy, "d 'de' MMMM 'de' yyyy", { locale: es }), PAGE_WIDTH - MARGIN, 32, { align: 'right' })

  doc.setDrawColor(30)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, 42, PAGE_WIDTH - MARGIN, 42)

  // Emisor / Arrendatario
  let y = 55
  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text('ARRENDADOR', MARGIN, y)
  doc.text('ARRENDATARIO', MARGIN + CONTENT_WIDTH / 2, y)

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(20)
  doc.text(datosFacturacion.nombre, MARGIN, y)
  doc.text(propiedad.inquilinoNombre || '—', MARGIN + CONTENT_WIDTH / 2, y)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90)
  y += 5
  doc.text(`NIF ${datosFacturacion.nif}`, MARGIN, y)
  if (propiedad.inquilinoDni) doc.text(`DNI ${propiedad.inquilinoDni}`, MARGIN + CONTENT_WIDTH / 2, y)

  y += 5
  const dirEmisor = doc.splitTextToSize(datosFacturacion.direccion, COL_WIDTH)
  const direccionInmueble = `${propiedad.direccion}${propiedad.municipio ? `, ${propiedad.municipio}` : ''}`
  const dirInmueble = doc.splitTextToSize(direccionInmueble, COL_WIDTH)
  doc.text(dirEmisor, MARGIN, y)
  doc.text(dirInmueble, MARGIN + CONTENT_WIDTH / 2, y)
  y += Math.max(dirEmisor.length, dirInmueble.length) * 5

  // Tabla
  y = Math.max(y + 10, 95)
  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text('CONCEPTO', MARGIN, y)
  doc.text('IMPORTE', PAGE_WIDTH - MARGIN, y, { align: 'right' })
  y += 3
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)

  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(20)
  const concepto = `Alquiler ${format(fechaTx, "MMMM 'de' yyyy", { locale: es })} — ${propiedad.nombre}`
  const conceptoLines = doc.splitTextToSize(concepto, CONTENT_WIDTH - 45)
  doc.text(conceptoLines, MARGIN, y)
  doc.text(fmtEUR(desglose ? desglose.base : tx.importe), PAGE_WIDTH - MARGIN, y, { align: 'right' })
  y += conceptoLines.length * 5

  if (tx.descripcion) {
    doc.setFontSize(8)
    doc.setTextColor(140)
    const descLines = doc.splitTextToSize(tx.descripcion, CONTENT_WIDTH - 45)
    doc.text(descLines, MARGIN, y)
    y += descLines.length * 4
  }

  if (desglose) {
    y += 4
    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text('IGIC (7%)', MARGIN, y)
    doc.text(`+${fmtEUR(desglose.igic)}`, PAGE_WIDTH - MARGIN, y, { align: 'right' })
    y += 6
    doc.text('Retención IRPF (19%)', MARGIN, y)
    doc.text(`-${fmtEUR(desglose.irpf)}`, PAGE_WIDTH - MARGIN, y, { align: 'right' })
  }

  y += 8
  doc.setDrawColor(30)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(20)
  doc.text(`TOTAL${desglose ? ' COBRADO' : ''}`, MARGIN, y)
  doc.text(fmtEUR(tx.importe), PAGE_WIDTH - MARGIN, y, { align: 'right' })

  if (tx.referencia) {
    y += 9
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Referencia: ${tx.referencia}`, MARGIN, y)
  }

  // Pie
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(140)
  const notaLegal = esFactura
    ? 'Operación sujeta a IGIC. Retención de IRPF practicada conforme a la normativa vigente.'
    : 'Arrendamiento de vivienda exento de IVA (art. 20.Uno.23º de la Ley del IVA).'
  doc.text(notaLegal, MARGIN, 273, { maxWidth: CONTENT_WIDTH })
  doc.text('Documento generado automáticamente — no sustituye el asesoramiento de tu gestoría.', MARGIN, 278, {
    maxWidth: CONTENT_WIDTH,
  })

  return doc
}

export function nombreArchivoFactura(tx: Transaccion, propiedad: Propiedad): string {
  const numero = tx.numeroFactura ?? 'borrador'
  const slug = propiedad.nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas diacríticas tras NFD (á -> a + ´)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${numero}-${slug}.pdf`
}
