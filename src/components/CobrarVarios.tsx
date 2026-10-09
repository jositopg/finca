import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { deudaInquilino, type Propiedad, type Transaccion } from '../types'
import {
  construirCobroRenta,
  filaCobroLote,
  propiedadesYaCobradas,
  type FilaCobroLote,
  type MotivoRevisar,
} from '../types/cobroRenta'
import { Badge } from './Badge'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'

interface Props {
  pendientes: Propiedad[]
  transacciones: Transaccion[]
  onClose: () => void
}

interface ResultadoLote {
  guardadas: FilaCobroLote[]
  saltadas: FilaCobroLote[]
  fallidas: FilaCobroLote[]
  sinConfirmar: FilaCobroLote[]
}

const ETIQUETA: Record<MotivoRevisar, string> = {
  deuda: 'deuda',
  parcial: 'cobro parcial',
  cambio: 'cambio de condiciones',
  atrasado: 'mes atrasado',
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function mesEnTexto(mes: string) {
  return format(new Date(`${mes}-01T00:00:00`), 'MMMM yyyy', { locale: es })
}

function fraseRevisar(fila: FilaCobroLote, transacciones: Transaccion[]) {
  const partes: string[] = []
  if (fila.motivos.includes('parcial')) {
    partes.push(`Ya hay ${fmt(fila.cobradoAlAbrir)} € cobrados ese mes`)
  }
  if (fila.motivos.includes('deuda')) {
    const deuda = deudaInquilino(fila.propiedad, transacciones)
    partes.push(
      deuda ? `Debe ${fmt(deuda.importe)} € de meses anteriores` : 'Tiene deuda de meses anteriores',
    )
  }
  if (fila.motivos.includes('cambio')) partes.push('Este mes cambian las condiciones')
  if (fila.motivos.includes('atrasado')) partes.push('Es un mes anterior al actual')
  return partes.join('. ')
}

function ListaResultado({ titulo, filas }: { titulo: string; filas: FilaCobroLote[] }) {
  if (filas.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-outline-variant uppercase tracking-wide">{titulo}</p>
      <ul className="flex flex-col">
        {filas.map((f) => (
          <li key={f.propiedad.id} className="text-sm text-on-surface py-1">
            {f.propiedad.nombre}
            <span className="text-outline-variant"> · {mesEnTexto(f.mesPagado)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CobrarVarios({ pendientes, transacciones, onClose }: Props) {
  const { addTxs, leerTransaccionesServidor, refreshData } = useApp()
  const { showToast } = useToast()
  const [filas] = useState(() => pendientes.map((p) => filaCobroLote(p, transacciones, new Date())))
  const [seleccion, setSeleccion] = useState(
    () =>
      new Set(
        filas.filter((f) => f.motivos.length === 0 && f.importe > 0).map((f) => f.propiedad.id),
      ),
  )
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [resultado, setResultado] = useState<ResultadoLote | null>(null)

  function toggle(fila: FilaCobroLote) {
    if (fila.importe <= 0) return
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(fila.propiedad.id)) next.delete(fila.propiedad.id)
      else next.add(fila.propiedad.id)
      return next
    })
  }

  async function handleRegistrar() {
    if (savingRef.current || !fecha || seleccion.size === 0) return
    savingRef.current = true
    setSaving(true)
    try {
      let frescas: Transaccion[]
      try {
        frescas = await leerTransaccionesServidor()
      } catch {
        showToast(
          'No se pudo comprobar si ya hay cobros registrados. Revisa la conexión y vuelve a intentarlo',
        )
        return
      }

      const filasSeleccionadas = filas.filter((f) => seleccion.has(f.propiedad.id))
      const saltadasIds = propiedadesYaCobradas(filasSeleccionadas, frescas)
      const saltadas = filasSeleccionadas.filter((f) => saltadasIds.has(f.propiedad.id))
      const aGuardar = filasSeleccionadas.filter((f) => !saltadasIds.has(f.propiedad.id))
      const txs = aGuardar.map((f) =>
        construirCobroRenta({
          propiedad: f.propiedad,
          mesPagado: f.mesPagado,
          fecha,
          rentaBruta: f.rentaBruta,
        }),
      )

      let guardadas: FilaCobroLote[] = []
      let fallidas: FilaCobroLote[] = []
      let sinConfirmar: FilaCobroLote[] = []

      if (txs.length > 0) {
        try {
          await addTxs(txs)
          guardadas = aGuardar
        } catch {
          try {
            const despues = await leerTransaccionesServidor()
            const ids = new Set(despues.map((t) => t.id))
            for (let i = 0; i < aGuardar.length; i++) {
              if (ids.has(txs[i].id)) guardadas.push(aGuardar[i])
              else fallidas.push(aGuardar[i])
            }
          } catch {
            sinConfirmar = aGuardar
          }
          void refreshData()
        }
      }

      if (saltadas.length > 0) void refreshData()

      const todoGuardado =
        guardadas.length === filasSeleccionadas.length &&
        saltadas.length === 0 &&
        fallidas.length === 0 &&
        sinConfirmar.length === 0
      if (todoGuardado) {
        showToast(`${guardadas.length} cobros registrados`, 'success')
        onClose()
      } else {
        setResultado({ guardadas, saltadas, fallidas, sinConfirmar })
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Cobrar varios">
      {resultado ? (
        <div className="flex flex-col gap-4 pb-4">
          <ListaResultado titulo="Guardados" filas={resultado.guardadas} />
          <ListaResultado titulo="Ya estaban cobrados (saltados)" filas={resultado.saltadas} />
          <ListaResultado titulo="No guardados" filas={resultado.fallidas} />
          <ListaResultado
            titulo="Sin confirmar: revisa Movimientos antes de repetir"
            filas={resultado.sinConfirmar}
          />
          <Button fullWidth onClick={onClose}>
            Cerrar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-surface-low rounded-xl divide-y divide-surface-high">
            {filas.map((fila) => {
              const puedeMarcar = fila.importe > 0
              const esLocal = fila.propiedad.tipo === 'local'
              return (
                <label
                  key={fila.propiedad.id}
                  className={`flex items-center gap-3 min-h-[56px] px-3 py-2 ${
                    puedeMarcar ? 'cursor-pointer' : 'opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-6 shrink-0 accent-success"
                    checked={seleccion.has(fila.propiedad.id)}
                    disabled={!puedeMarcar || saving}
                    onChange={() => toggle(fila)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-on-surface truncate">{fila.propiedad.nombre}</p>
                    <p className="text-xs text-outline-variant truncate">
                      {fila.propiedad.inquilinoNombre ?? 'Sin nombre'}
                    </p>
                    <p className="text-xs text-outline-variant">paga {mesEnTexto(fila.mesPagado)}</p>
                    {fila.motivos.length > 0 && (
                      <div className="mt-1 flex flex-col items-start gap-1">
                        <Badge
                          variant="warning"
                          label={`revisar · ${fila.motivos.map((m) => ETIQUETA[m]).join(' · ')}`}
                        />
                        <p className="text-xs text-outline-variant">{fraseRevisar(fila, transacciones)}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-success">{fmt(fila.importe)} €</p>
                    {esLocal && (
                      <p className="text-xs text-outline-variant">neta · base {fmt(fila.rentaBruta)} €</p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>

          <Input
            label="Fecha de cobro"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />

          {/* BottomSheet deja pb-8 en el scroll; el margen negativo pega el pie al borde visible. */}
          <div className="sticky bottom-0 -mx-5 -mb-8 bg-surface-lowest px-5 pt-3 pb-8 flex gap-3">
            <Button variant="secondary" fullWidth onClick={onClose}>
              Cancelar
            </Button>
            <Button
              fullWidth
              onClick={handleRegistrar}
              disabled={saving || seleccion.size === 0 || !fecha}
            >
              {saving ? 'Guardando...' : `Registrar ${seleccion.size} cobros`}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
