import { X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import {
  HUECO_MENSUAL_LABEL,
  huecosMensuales,
  omitirHuecoMensual,
  type HuecoMensual,
  type Propiedad,
  type Transaccion,
} from '../types'

interface Props {
  propiedad: Propiedad
  transacciones: Transaccion[]
}

function etiquetaMes(mes: string) {
  return format(parseISO(`${mes}-01`), 'MMM yyyy', { locale: es })
}

export function HuecosMensuales({ propiedad, transacciones }: Props) {
  const { updateProp } = useApp()
  const huecos = huecosMensuales(propiedad, transacciones)
  if (huecos.length === 0) return null

  async function quitar(h: HuecoMensual) {
    await updateProp(omitirHuecoMensual(propiedad, h))
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">
        Falta registrar
      </p>
      <p className="text-xs text-outline-variant -mt-1">
        Cuenta el mes facturado, no cuándo lo metiste. Quita el aviso si no aplica.
      </p>
      <div className="flex flex-wrap gap-2">
        {huecos.map((h) => (
          <span
            key={`${h.tipo}-${h.mes}`}
            className="inline-flex items-center gap-1 bg-warning-container text-warning text-xs font-medium rounded-full pl-2.5 pr-1 py-1"
          >
            {HUECO_MENSUAL_LABEL[h.tipo]} {etiquetaMes(h.mes)}
            <button
              type="button"
              onClick={() => quitar(h)}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-warning/15"
              aria-label={`Quitar aviso de ${HUECO_MENSUAL_LABEL[h.tipo]} ${etiquetaMes(h.mes)}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}
