import { useState } from 'react'
import { FilePlus, PenLine, Trash2 } from 'lucide-react'
import { addDays, addYears, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Input, Textarea } from './Input'
import {
  alquilerVigente,
  aplicarCambioCondiciones,
  fechaISO,
  parseImporte,
  periodoTramo,
  quitarTramoContrato,
  sustituirPorContratoNuevo,
  type Propiedad,
} from '../types'

interface Props {
  propiedad: Propiedad
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFecha(iso: string) {
  return format(parseISO(iso), 'd MMM yyyy', { locale: es })
}

function fechaPorDefectoCambio(_propiedad: Propiedad, hoy: Date): string {
  return fechaISO(hoy)
}

function fechaPorDefectoContratoNuevo(propiedad: Propiedad, hoy: Date): string {
  const hoyStr = fechaISO(hoy)
  if (propiedad.contratoFin && propiedad.contratoFin >= hoyStr) {
    return format(addDays(parseISO(propiedad.contratoFin), 1), 'yyyy-MM-dd')
  }
  return hoyStr
}

function finPorDefecto(propiedad: Propiedad, vigenteDesde: string): string {
  if (propiedad.contratoFin && vigenteDesde && propiedad.contratoFin >= vigenteDesde) {
    return format(addYears(parseISO(propiedad.contratoFin), 1), 'yyyy-MM-dd')
  }
  if (vigenteDesde) {
    return format(addDays(addYears(parseISO(vigenteDesde), 1), -1), 'yyyy-MM-dd')
  }
  return ''
}

export function CambiarCondiciones({ propiedad }: Props) {
  const { updateProp } = useApp()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [vigenteDesde, setVigenteDesde] = useState('')
  const [alquilerStr, setAlquilerStr] = useState('')
  const [contratoFin, setContratoFin] = useState('')
  const [fianzaStr, setFianzaStr] = useState('')
  const [notas, setNotas] = useState('')

  function abrir() {
    const hoy = new Date()
    const desde = fechaPorDefectoCambio(propiedad, hoy)
    setVigenteDesde(desde)
    setAlquilerStr(propiedad.alquilerMensual != null ? propiedad.alquilerMensual.toString() : '')
    setContratoFin(finPorDefecto(propiedad, desde))
    setFianzaStr(propiedad.fianzaImporte != null ? propiedad.fianzaImporte.toString() : '')
    setNotas('')
    setOpen(true)
  }

  async function handleConfirm() {
    if (saving) return
    const alquilerParseado = alquilerStr.trim() ? parseImporte(alquilerStr) : undefined
    if (alquilerStr.trim() && (Number.isNaN(alquilerParseado) || (alquilerParseado ?? 0) <= 0)) {
      showToast('Importe de alquiler inválido')
      return
    }
    const fianzaParseada = fianzaStr.trim() ? parseImporte(fianzaStr) : undefined
    if (fianzaStr.trim() && Number.isNaN(fianzaParseada)) {
      showToast('Importe de fianza inválido')
      return
    }
    setSaving(true)
    try {
      const resultado = aplicarCambioCondiciones(propiedad, {
        vigenteDesde,
        alquilerMensual: alquilerParseado,
        contratoFin: contratoFin || undefined,
        fianzaImporte: fianzaParseada,
        notas,
      })
      if (!resultado.ok) {
        showToast(resultado.error)
        return
      }
      await updateProp(resultado.propiedad)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary-container text-primary text-sm font-medium hover:brightness-95 transition-all w-full"
      >
        <PenLine size={16} />
        Cambiar condiciones
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Cambiar condiciones">
        <div className="flex flex-col gap-5 pb-4">
          <p className="text-sm text-outline-variant">
            El contrato sigue en vigor con el mismo inquilino. Las nuevas
            condiciones aplican a partir de la fecha que indiques — la renta
            anterior se conserva para los meses previos (deuda, cobros,
            avisos).
          </p>

          <Input
            label="Aplica desde"
            type="date"
            value={vigenteDesde}
            onChange={(e) => setVigenteDesde(e.target.value)}
          />
          <Input
            label="Alquiler mensual €"
            type="text"
            inputMode="decimal"
            placeholder="800 o 800,50"
            value={alquilerStr}
            onChange={(e) => setAlquilerStr(e.target.value)}
          />
          <Input
            label="Nuevo fin del contrato"
            type="date"
            value={contratoFin}
            onChange={(e) => setContratoFin(e.target.value)}
          />
          <Input
            label="Fianza € (opcional)"
            type="text"
            inputMode="decimal"
            placeholder="800"
            value={fianzaStr}
            onChange={(e) => setFianzaStr(e.target.value)}
          />
          <Textarea
            label="Nota (opcional)"
            placeholder="Renovación, IPC, anexo firmado…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleConfirm} disabled={saving || !vigenteDesde}>
              {saving ? 'Guardando...' : 'Guardar cambio'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}

export function NuevoContrato({ propiedad }: Props) {
  const { updateProp } = useApp()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fechaFinAnterior, setFechaFinAnterior] = useState('')
  const [contratoInicio, setContratoInicio] = useState('')
  const [contratoFin, setContratoFin] = useState('')
  const [alquilerStr, setAlquilerStr] = useState('')
  const [fianzaStr, setFianzaStr] = useState('')

  function setInicioYFinAnterior(inicio: string) {
    setContratoInicio(inicio)
    if (!inicio) {
      setFechaFinAnterior('')
      return
    }
    setFechaFinAnterior(format(addDays(parseISO(inicio), -1), 'yyyy-MM-dd'))
  }

  function abrir() {
    const hoy = new Date()
    const inicio = fechaPorDefectoContratoNuevo(propiedad, hoy)
    setInicioYFinAnterior(inicio)
    setContratoFin(finPorDefecto(propiedad, inicio))
    setAlquilerStr(propiedad.alquilerMensual != null ? propiedad.alquilerMensual.toString() : '')
    setFianzaStr(propiedad.fianzaImporte != null ? propiedad.fianzaImporte.toString() : '')
    setOpen(true)
  }

  async function handleConfirm() {
    if (saving) return
    const alquilerParseado = alquilerStr.trim() ? parseImporte(alquilerStr) : undefined
    if (alquilerStr.trim() && (Number.isNaN(alquilerParseado) || (alquilerParseado ?? 0) <= 0)) {
      showToast('Importe de alquiler inválido')
      return
    }
    const fianzaParseada = fianzaStr.trim() ? parseImporte(fianzaStr) : undefined
    if (fianzaStr.trim() && Number.isNaN(fianzaParseada)) {
      showToast('Importe de fianza inválido')
      return
    }
    setSaving(true)
    try {
      const resultado = sustituirPorContratoNuevo(propiedad, {
        fechaFinAnterior,
        contratoInicio,
        contratoFin: contratoFin || undefined,
        alquilerMensual: alquilerParseado,
        fianzaImporte: fianzaParseada,
      })
      if (!resultado.ok) {
        showToast(resultado.error)
        return
      }
      await updateProp(resultado.propiedad)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary-container text-primary text-sm font-medium hover:brightness-95 transition-all w-full"
      >
        <FilePlus size={16} />
        Contrato nuevo
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Contrato nuevo">
        <div className="flex flex-col gap-5 pb-4">
          <p className="text-sm text-outline-variant">
            {propiedad.inquilinoNombre ? `${propiedad.inquilinoNombre} se queda. ` : 'El inquilino se queda. '}
            El contrato actual pasa al historial de alquileres y arranca uno
            nuevo (nueva fecha de inicio y aniversario). El PDF hay que
            adjuntarlo otra vez. Si solo quieres cambiar la renta o alargar
            el actual, usa «Cambiar condiciones».
          </p>

          <Input
            label="Fin del contrato actual"
            type="date"
            value={fechaFinAnterior}
            onChange={(e) => setFechaFinAnterior(e.target.value)}
          />
          <Input
            label="Inicio del contrato nuevo"
            type="date"
            value={contratoInicio}
            onChange={(e) => setInicioYFinAnterior(e.target.value)}
          />
          <Input
            label="Fin del contrato nuevo"
            type="date"
            value={contratoFin}
            onChange={(e) => setContratoFin(e.target.value)}
          />
          <Input
            label="Alquiler mensual €"
            type="text"
            inputMode="decimal"
            placeholder="800 o 800,50"
            value={alquilerStr}
            onChange={(e) => setAlquilerStr(e.target.value)}
          />
          <Input
            label="Fianza € (opcional)"
            type="text"
            inputMode="decimal"
            placeholder="800"
            value={fianzaStr}
            onChange={(e) => setFianzaStr(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              fullWidth
              onClick={handleConfirm}
              disabled={saving || !fechaFinAnterior || !contratoInicio}
            >
              {saving ? 'Guardando...' : 'Guardar contrato nuevo'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}

export function TramosContrato({ propiedad }: Props) {
  const { updateProp } = useApp()
  const { showToast } = useToast()
  const [borrarId, setBorrarId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const tramos = propiedad.tramosContrato
  if (!tramos || tramos.length === 0) return null

  const hoyStr = fechaISO()
  const ordenados = [...tramos].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))

  async function handleBorrar() {
    if (!borrarId || saving) return
    setSaving(true)
    try {
      await updateProp(quitarTramoContrato(propiedad, borrarId))
      setBorrarId(null)
    } catch (err) {
      console.error('Quitar tramo error', err)
      showToast('No se pudo quitar el cambio de condiciones')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-outline-variant uppercase tracking-wide">
          Condiciones del contrato
        </span>
        <div className="flex flex-col gap-2">
          {ordenados.map((t, i) => {
            const periodo = periodoTramo(ordenados, i)
            const esFuturo = t.vigenteDesde > hoyStr
            const siguiente = ordenados[i + 1]
            const esVigente = !esFuturo && (!siguiente || siguiente.vigenteDesde > hoyStr)
            const alquiler = t.alquilerMensual ?? alquilerVigente(propiedad, t.vigenteDesde)
            return (
              <div key={t.id} className="bg-surface-low rounded-xl px-4 py-3 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-on-surface">
                      {fmtFecha(periodo.desde)}
                      {periodo.hasta ? ` – ${fmtFecha(periodo.hasta)}` : ' – en adelante'}
                    </p>
                    <p className="text-xs text-outline-variant mt-0.5">
                      {alquiler != null ? `${fmt(alquiler)} €/mes` : 'Sin renta pactada'}
                      {esVigente ? ' · vigente' : esFuturo ? ' · próximo' : ''}
                    </p>
                    {t.notas && <p className="text-xs text-outline-variant mt-0.5">{t.notas}</p>}
                  </div>
                  {ordenados.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBorrarId(t.id)}
                      className="text-outline-variant hover:text-error flex-shrink-0"
                      aria-label="Quitar este cambio de condiciones"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <ConfirmDialog
        open={borrarId !== null}
        title="Quitar este cambio"
        message="Se eliminan estas condiciones. El contrato sigue en vigor; la ficha vuelve a las del tramo anterior."
        confirmLabel={saving ? 'Quitando...' : 'Quitar'}
        onConfirm={handleBorrar}
        onCancel={() => setBorrarId(null)}
      />
    </>
  )
}
