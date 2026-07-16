import { useState } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Printer, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Button } from './Button'
import { DatosFacturacionForm } from './DatosFacturacionForm'
import {
  baseDesdeRentaNeta,
  calcularRentaLocal,
  datosFacturacionCompletos,
  siguienteNumeroFactura,
  tipoDocumentoAlquiler,
  type Propiedad,
  type Transaccion,
} from '../types'

interface Props {
  tx: Transaccion
  propiedad: Propiedad
  onClose: () => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FacturaAlquiler({ tx, propiedad, onClose }: Props) {
  const { datosFacturacion, transacciones, updateTx, guardarDatosFacturacion } = useApp()
  const [generando, setGenerando] = useState(false)

  const tipoDoc = tipoDocumentoAlquiler(propiedad)
  const esFactura = tipoDoc === 'F'
  const local = propiedad.tipo === 'local'
  const desglose = local ? calcularRentaLocal(baseDesdeRentaNeta(tx.importe)) : null

  const hoy = new Date()
  const fechaTx = parseISO(tx.fecha)

  async function handleGenerar() {
    if (generando || tx.numeroFactura) return
    setGenerando(true)
    try {
      const anio = hoy.getFullYear().toString()
      const numero = siguienteNumeroFactura(transacciones, tipoDoc, anio)
      await updateTx({ ...tx, numeroFactura: numero })
    } finally {
      setGenerando(false)
    }
  }

  if (!datosFacturacionCompletos(datosFacturacion)) {
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-surface flex flex-col print:hidden">
        <div className="flex items-center justify-between px-5 pt-12 pb-4">
          <h2 className="font-display text-lg font-bold text-on-surface">Tus datos de facturación</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-outline-variant hover:bg-surface-low transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 overflow-y-auto flex-1">
          <DatosFacturacionForm
            initial={datosFacturacion}
            onSave={async (d) => {
              await guardarDatosFacturacion(d)
            }}
            onCancel={onClose}
          />
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-white overflow-y-auto">
      {/* Barra de acciones — no se imprime */}
      <div className="print:hidden sticky top-0 z-10 bg-surface-lowest border-b border-surface-high flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-outline-variant"
        >
          <X size={16} />
          Cerrar
        </button>
        {tx.numeroFactura ? (
          <Button size="sm" onClick={() => window.print()}>
            <Printer size={14} />
            Imprimir / Guardar PDF
          </Button>
        ) : (
          <Button size="sm" onClick={handleGenerar} disabled={generando}>
            {generando ? 'Generando...' : `Generar ${esFactura ? 'factura' : 'recibo'}`}
          </Button>
        )}
      </div>

      {/* Documento */}
      <div className="max-w-[210mm] mx-auto bg-white text-gray-900 p-8 sm:p-12 print:p-0">
        <div className="flex items-start justify-between mb-10 pb-6 border-b-2 border-gray-800">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">
              {esFactura ? 'FACTURA' : 'RECIBO DE ALQUILER'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Nº {tx.numeroFactura ?? <span className="italic">pendiente de generar</span>}
            </p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>Fecha de emisión</p>
            <p className="font-medium text-gray-900">
              {format(hoy, "d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Arrendador</p>
            <p className="text-sm font-medium">{datosFacturacion.nombre}</p>
            <p className="text-sm text-gray-600">NIF {datosFacturacion.nif}</p>
            <p className="text-sm text-gray-600">{datosFacturacion.direccion}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Arrendatario</p>
            <p className="text-sm font-medium">{propiedad.inquilinoNombre || '—'}</p>
            {propiedad.inquilinoDni && <p className="text-sm text-gray-600">DNI {propiedad.inquilinoDni}</p>}
            <p className="text-sm text-gray-600">
              {propiedad.direccion}
              {propiedad.municipio ? `, ${propiedad.municipio}` : ''}
            </p>
          </div>
        </div>

        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="py-2 font-semibold">Concepto</th>
              <th className="py-2 font-semibold text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-3">
                Alquiler {format(fechaTx, "MMMM 'de' yyyy", { locale: es })} — {propiedad.nombre}
                {tx.descripcion && <span className="block text-xs text-gray-500 mt-0.5">{tx.descripcion}</span>}
              </td>
              <td className="py-3 text-right tabular-nums">
                {fmt(desglose ? desglose.base : tx.importe)} €
              </td>
            </tr>
            {desglose && (
              <>
                <tr className="border-b border-gray-200">
                  <td className="py-2 text-gray-600">IGIC (7%)</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">+{fmt(desglose.igic)} €</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 text-gray-600">Retención IRPF (19%)</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">-{fmt(desglose.irpf)} €</td>
                </tr>
              </>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 font-bold text-base">TOTAL {desglose ? 'COBRADO' : ''}</td>
              <td className="pt-4 font-bold text-base text-right tabular-nums">{fmt(tx.importe)} €</td>
            </tr>
          </tfoot>
        </table>

        {tx.referencia && (
          <p className="text-xs text-gray-500 mb-8">Referencia: {tx.referencia}</p>
        )}

        <div className="pt-6 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <p>
            {esFactura
              ? 'Operación sujeta a IGIC. Retención de IRPF practicada conforme a la normativa vigente.'
              : 'Arrendamiento de vivienda exento de IVA (art. 20.Uno.23º de la Ley del IVA).'}
          </p>
          <p>Documento generado automáticamente — no sustituye el asesoramiento de tu gestoría.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
