import { useState } from 'react'
import { AlertTriangle, Check, ListTodo, Plus, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from './Button'
import { Badge } from './Badge'
import { Input, Select, Textarea } from './Input'
import {
  ordenarTareas,
  PRIORIDAD_BADGE_VARIANT,
  PRIORIDAD_LABELS,
  tareaVencida,
  type Propiedad,
  type Tarea,
  type TareaPrioridad,
} from '../types'

function uuid() {
  return crypto.randomUUID()
}

interface Props {
  propiedad: Propiedad
}

export function TareasPropiedad({ propiedad }: Props) {
  const { tareas, addTareaProp, updateTareaProp, deleteTareaProp } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [verHechas, setVerHechas] = useState(false)

  const [titulo, setTitulo] = useState('')
  const [prioridad, setPrioridad] = useState<TareaPrioridad>('media')
  const [fechaLimite, setFechaLimite] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tareasPropiedad = ordenarTareas(tareas.filter((t) => t.propiedadId === propiedad.id))
  const pendientes = tareasPropiedad.filter((t) => t.estado === 'pendiente')
  const hechas = tareasPropiedad.filter((t) => t.estado === 'hecha')
  const visibles = verHechas ? tareasPropiedad : pendientes

  function abrir() {
    setTitulo('')
    setPrioridad('media')
    setFechaLimite('')
    setDescripcion('')
    setError('')
    setShowAdd(true)
  }

  async function handleAdd() {
    if (saving) return
    if (!titulo.trim()) {
      setError('El título es obligatorio')
      return
    }
    setSaving(true)
    try {
      const tarea: Tarea = {
        id: uuid(),
        propiedadId: propiedad.id,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        prioridad,
        fechaLimite: fechaLimite || undefined,
        estado: 'pendiente',
        creadoEn: new Date().toISOString(),
      }
      await addTareaProp(tarea)
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  async function toggleEstado(t: Tarea) {
    await updateTareaProp({ ...t, estado: t.estado === 'pendiente' ? 'hecha' : 'pendiente' })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-outline-variant uppercase tracking-wide flex items-center gap-1.5">
          <ListTodo size={14} />
          Tareas{pendientes.length > 0 ? ` (${pendientes.length})` : ''}
        </p>
        <button onClick={abrir} className="flex items-center gap-1 text-xs text-primary font-medium">
          <Plus size={14} />
          Añadir
        </button>
      </div>

      {tareasPropiedad.length === 0 ? (
        <p className="text-xs text-outline-variant">Sin tareas todavía.</p>
      ) : (
        <>
          {visibles.length === 0 ? (
            <p className="text-xs text-outline-variant">Sin tareas pendientes.</p>
          ) : (
            <div className="bg-surface-lowest rounded-2xl shadow-soft divide-y divide-surface-high">
              {visibles.map((t) => {
                const vencida = tareaVencida(t)
                return (
                  <div key={t.id} className="p-3 flex items-start gap-3">
                    <button
                      onClick={() => toggleEstado(t)}
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                        t.estado === 'hecha'
                          ? 'bg-success border-success'
                          : 'border-outline-variant/40 hover:border-primary'
                      }`}
                    >
                      {t.estado === 'hecha' && <Check size={12} className="text-on-primary" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          t.estado === 'hecha' ? 'text-outline-variant line-through' : 'text-on-surface'
                        }`}
                      >
                        {t.titulo}
                      </p>
                      {t.descripcion && <p className="text-xs text-outline-variant mt-0.5">{t.descripcion}</p>}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge label={PRIORIDAD_LABELS[t.prioridad]} variant={PRIORIDAD_BADGE_VARIANT[t.prioridad]} />
                        {t.fechaLimite && (
                          <span
                            className={`text-xs flex items-center gap-1 ${
                              vencida ? 'text-error font-medium' : 'text-outline-variant'
                            }`}
                          >
                            {vencida && <AlertTriangle size={11} />}
                            {format(parseISO(t.fechaLimite), 'd MMM yyyy', { locale: es })}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmDelete(t.id)}
                      className="text-outline-variant hover:text-error flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {hechas.length > 0 && (
            <button onClick={() => setVerHechas((v) => !v)} className="text-xs text-outline-variant self-start">
              {verHechas ? 'Ocultar completadas' : `Ver ${hechas.length} completada${hechas.length === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      )}

      <BottomSheet open={showAdd} onClose={() => setShowAdd(false)} title="Nueva tarea">
        <div className="flex flex-col gap-5 pb-4">
          <Input
            label="Título"
            placeholder="Cambiar el termo, revisar el contrato..."
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            error={error}
          />
          <Select label="Prioridad" value={prioridad} onChange={(e) => setPrioridad(e.target.value as TareaPrioridad)}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </Select>
          <Input
            label="Fecha límite (opcional)"
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
          <Textarea
            label="Descripción (opcional)"
            placeholder="Detalles..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setShowAdd(false)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleAdd} disabled={saving}>
              {saving ? 'Guardando...' : 'Añadir tarea'}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar tarea"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (confirmDelete) await deleteTareaProp(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
