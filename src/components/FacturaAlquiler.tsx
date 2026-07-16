import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { uploadFile } from '../api/drive'
import { generarFacturaPDF, nombreArchivoFactura } from '../api/facturaPdf'
import { Button } from './Button'
import { DatosFacturacionForm } from './DatosFacturacionForm'
import {
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

export function FacturaAlquiler({ tx, propiedad, onClose }: Props) {
  const { datosFacturacion, transacciones, updateTx, guardarDatosFacturacion, ensurePropFolder } = useApp()
  const { showToast } = useToast()
  const [generando, setGenerando] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  const tipoDoc = tipoDocumentoAlquiler(propiedad)
  const esFactura = tipoDoc === 'F'

  // Vista previa: el mismo PDF que se sube a Drive al generar — sin
  // número mientras no se haya generado. Es un cálculo local puro (no
  // toca red ni DB), así que no hay problema en que se regenere si el
  // efecto se reejecuta (p.ej. React StrictMode en desarrollo).
  useEffect(() => {
    if (!datosFacturacionCompletos(datosFacturacion)) return
    let cancelado = false
    let urlLocal: string | null = null
    generarFacturaPDF(tx, propiedad, datosFacturacion).then((pdf) => {
      if (cancelado) return
      urlLocal = URL.createObjectURL(pdf.output('blob'))
      setBlobUrl(urlLocal)
    })
    return () => {
      cancelado = true
      if (urlLocal) URL.revokeObjectURL(urlLocal)
    }
  }, [tx, propiedad, datosFacturacion])

  async function handleGenerar() {
    if (generando || tx.numeroFactura || !datosFacturacionCompletos(datosFacturacion)) return
    setGenerando(true)
    try {
      const anio = new Date().getFullYear().toString()
      const numero = siguienteNumeroFactura(transacciones, tipoDoc, anio)
      const txConNumero: Transaccion = { ...tx, numeroFactura: numero }

      const folderId = await ensurePropFolder(propiedad.id, propiedad.nombre)
      const pdf = await generarFacturaPDF(txConNumero, propiedad, datosFacturacion)
      const blob = pdf.output('blob')
      const archivo = new File([blob], nombreArchivoFactura(txConNumero, propiedad), {
        type: 'application/pdf',
      })
      const subido = await uploadFile(archivo, folderId)

      await updateTx({ ...txConNumero, archivos: [...tx.archivos, subido.id] })
      showToast(`${esFactura ? 'Factura' : 'Recibo'} guardado en Drive`, 'success')
    } catch (err) {
      console.error('Generar factura error', err)
      showToast('No se pudo generar o guardar el documento')
    } finally {
      setGenerando(false)
    }
  }

  if (!datosFacturacionCompletos(datosFacturacion)) {
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-surface flex flex-col">
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
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-high">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-outline-variant">
          <X size={16} />
          Cerrar
        </button>
        {tx.numeroFactura ? (
          <div className="flex items-center gap-2">
            {blobUrl && (
              <a
                href={blobUrl}
                download={nombreArchivoFactura(tx, propiedad)}
                className="flex items-center gap-1.5 text-xs text-primary font-medium px-2"
              >
                <Download size={14} />
                Descargar
              </a>
            )}
            <a
              href={`https://drive.google.com/drive/folders/${propiedad.folderId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary font-medium px-2"
            >
              <ExternalLink size={14} />
              Ver carpeta en Drive
            </a>
          </div>
        ) : (
          <Button size="sm" onClick={handleGenerar} disabled={generando || !blobUrl}>
            {generando ? 'Generando...' : `Generar ${esFactura ? 'factura' : 'recibo'} y guardar en Drive`}
          </Button>
        )}
      </div>

      {tx.numeroFactura && (
        <p className="text-xs text-success text-center py-2 bg-success-container/30">
          {esFactura ? 'Factura' : 'Recibo'} nº {tx.numeroFactura} guardado en la carpeta de "{propiedad.nombre}"
        </p>
      )}

      <div className="flex-1 min-h-0">
        {blobUrl ? (
          <iframe src={blobUrl} title="Vista previa del documento" className="w-full h-full border-0" />
        ) : (
          <div className="flex-1 h-full flex items-center justify-center">
            <p className="text-sm text-outline-variant">Generando vista previa...</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
