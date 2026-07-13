import { AlertTriangle, ListTodo } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from './Badge'
import {
  ordenarTareas,
  PRIORIDAD_BADGE_VARIANT,
  PRIORIDAD_LABELS,
  tareaVencida,
  type Propiedad,
  type Tarea,
} from '../types'

interface Props {
  propiedades: Propiedad[]
  tareas: Tarea[]
  onSelectPropiedad: (propiedadId: string) => void
}

const MAX_VISIBLES = 5

// Todas las tareas pendientes de todas las propiedades, para no obligar a
// entrar en cada ficha para ver qué hay que hacer — mismo orden que dentro
// de la propiedad (prioridad y luego fecha límite más próxima).
export function TareasDashboard({ propiedades, tareas, onSelectPropiedad }: Props) {
  const pendientes = ordenarTareas(tareas.filter((t) => t.estado === 'pendiente'))
  if (pendientes.length === 0) return null

  const propiedadPorId = new Map(propiedades.map((p) => [p.id, p]))
  const visibles = pendientes.slice(0, MAX_VISIBLES)
  const vencidas = pendientes.filter((t) => tareaVencida(t)).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-outline-variant uppercase tracking-wide flex items-center gap-1.5">
          <ListTodo size={14} />
          Tareas pendientes ({pendientes.length})
        </p>
        {vencidas > 0 && (
          <span className="text-xs text-error font-medium flex items-center gap-1">
            <AlertTriangle size={11} />
            {vencidas} vencida{vencidas === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="bg-surface-lowest rounded-2xl shadow-soft divide-y divide-surface-high">
        {visibles.map((t) => {
          const propiedad = propiedadPorId.get(t.propiedadId)
          const vencida = tareaVencida(t)
          return (
            <button
              key={t.id}
              onClick={() => onSelectPropiedad(t.propiedadId)}
              className="w-full text-left p-3 flex items-start gap-3 hover:bg-surface-low transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-on-surface truncate">{t.titulo}</p>
                <p className="text-xs text-outline-variant truncate mt-0.5">
                  {propiedad?.nombre ?? '(propiedad eliminada)'}
                </p>
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
            </button>
          )
        })}
      </div>

      {pendientes.length > MAX_VISIBLES && (
        <p className="text-xs text-outline-variant text-center">
          +{pendientes.length - MAX_VISIBLES} más — entra en cada propiedad para verlas todas
        </p>
      )}
    </div>
  )
}
