import { useRef, useState } from 'react'
import { FileText, Upload, ExternalLink, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { uploadFile } from '../api/drive'
import type { Propiedad } from '../types'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  propiedad: Propiedad
}

export function ContratoAlquiler({ propiedad }: Props) {
  const { ensurePropFolder, updateProp } = useApp()
  const [uploading, setUploading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const folderId = await ensurePropFolder(propiedad.id, propiedad.nombre)
      const uploaded = await uploadFile(file, folderId)
      await updateProp({
        ...propiedad,
        contratoArchivoId: uploaded.id,
        contratoArchivoNombre: uploaded.name,
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    await updateProp({
      ...propiedad,
      contratoArchivoId: undefined,
      contratoArchivoNombre: undefined,
    })
    setConfirmRemove(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        Contrato de alquiler
      </span>

      {propiedad.contratoArchivoId ? (
        <div className="flex items-center gap-2 bg-surface-low rounded-xl px-4 py-3">
          <FileText size={16} className="text-outline-variant flex-shrink-0" />
          <span className="text-sm text-on-surface truncate flex-1">
            {propiedad.contratoArchivoNombre || 'Contrato'}
          </span>
          <a
            href={`https://drive.google.com/file/d/${propiedad.contratoArchivoId}/view`}
            target="_blank"
            rel="noreferrer"
            className="text-primary flex-shrink-0"
          >
            <ExternalLink size={15} />
          </a>
          <button
            onClick={() => setConfirmRemove(true)}
            className="text-outline-variant hover:text-error flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 py-2.5 px-4 rounded-xl border-2 border-dashed border-outline-variant/40 text-sm text-outline-variant hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
        >
          <Upload size={16} />
          {uploading ? 'Subiendo...' : 'Añadir contrato de alquiler'}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*,.doc,.docx"
        onChange={handleFile}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="Quitar contrato"
        message="Se desvincula de la propiedad, pero el archivo seguirá guardado en la carpeta de Google Drive."
        confirmLabel="Quitar"
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  )
}
