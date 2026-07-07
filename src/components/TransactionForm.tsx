import { useState, useRef } from 'react'
import { Paperclip, X, Upload } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from './Button'
import { Input, Select, Textarea } from './Input'
import type { Propiedad, Transaccion, TransaccionTipo } from '../types'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '../types'
import { useApp } from '../context/AppContext'
import { uploadFile } from '../api/drive'

interface Props {
  propiedades: Propiedad[]
  defaultPropiedadId?: string
  defaultTipo?: TransaccionTipo
  onSave: (t: Transaccion) => void
  onCancel: () => void
}

function uuid() {
  return crypto.randomUUID()
}

export function TransactionForm({
  propiedades,
  defaultPropiedadId,
  defaultTipo = 'gasto',
  onSave,
  onCancel,
}: Props) {
  const { ensurePropFolder } = useApp()
  const [tipo, setTipo] = useState<TransaccionTipo>(defaultTipo)
  const [propiedadId, setPropiedadId] = useState(
    defaultPropiedadId ?? propiedades[0]?.id ?? '',
  )
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [importe, setImporte] = useState('')
  const [categoria, setCategoria] = useState<string>(
    defaultTipo === 'ingreso' ? CATEGORIAS_INGRESO[0] : CATEGORIAS_GASTO[0],
  )
  const [descripcion, setDescripcion] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const categorias = tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!propiedadId) e.propiedad = 'Selecciona una propiedad'
    if (!importe || parseFloat(importe) <= 0) e.importe = 'Importe inválido'
    if (!categoria) e.categoria = 'Selecciona una categoría'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return

    setUploading(true)
    try {
      let archivoIds: string[] = []

      if (pendingFiles.length > 0) {
        const propiedad = propiedades.find((p) => p.id === propiedadId)!
        const folderId = await ensurePropFolder(propiedadId, propiedad.nombre)
        const uploaded = await Promise.all(
          pendingFiles.map((f) => uploadFile(f, folderId)),
        )
        archivoIds = uploaded.map((f) => f.id)
      }

      const tx: Transaccion = {
        id: uuid(),
        propiedadId,
        fecha,
        tipo,
        importe: parseFloat(importe),
        categoria,
        descripcion,
        archivos: archivoIds,
        creadoEn: new Date().toISOString(),
      }

      onSave(tx)
    } finally {
      setUploading(false)
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setPendingFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  function removeFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Tipo toggle */}
      <div className="flex gap-2 bg-surface-low rounded-xl p-1">
        {(['gasto', 'ingreso'] as TransaccionTipo[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTipo(t)
              setCategoria(
                t === 'ingreso' ? CATEGORIAS_INGRESO[0] : CATEGORIAS_GASTO[0],
              )
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tipo === t
                ? t === 'ingreso'
                  ? 'bg-success-container text-success'
                  : 'bg-surface-lowest text-on-surface shadow-soft'
                : 'text-outline-variant'
            }`}
          >
            {t === 'gasto' ? 'Gasto' : 'Ingreso'}
          </button>
        ))}
      </div>

      {propiedades.length > 1 && (
        <Select
          label="Propiedad"
          value={propiedadId}
          onChange={(e) => setPropiedadId(e.target.value)}
          error={errors.propiedad}
        >
          {propiedades.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            label="Importe (€)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            error={errors.importe}
          />
        </div>
        <div className="flex-1">
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      <Select
        label="Categoría"
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        error={errors.categoria}
      >
        {categorias.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <Textarea
        label="Descripción (opcional)"
        placeholder="Factura julio, reparación grifo..."
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      {/* File attach */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-outline-variant uppercase tracking-wide">
          Adjuntar archivos
        </span>
        {pendingFiles.length > 0 && (
          <div className="flex flex-col gap-1">
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-surface-low rounded-lg px-3 py-2"
              >
                <Paperclip size={14} className="text-outline-variant flex-shrink-0" />
                <span className="text-xs text-on-surface truncate flex-1">{f.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="text-outline-variant hover:text-error"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 py-2.5 px-4 rounded-xl border-2 border-dashed border-outline-variant/40 text-sm text-outline-variant hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Upload size={16} />
          Añadir factura o recibo
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFilePick}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Cancelar
        </Button>
        <Button fullWidth onClick={handleSubmit} disabled={uploading}>
          {uploading ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
