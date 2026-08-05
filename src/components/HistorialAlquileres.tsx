import { useState } from 'react'
import { FileText } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import { parseImporte, type ContratoHistorico, type Propiedad } from '../types'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function HistorialAlquileres({ propiedad }: { propiedad: Propiedad }) {
  const { updateProp } = useApp()
  const { showToast } = useToast()
  const [editando, setEditando] = useState<ContratoHistorico | null>(null)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [dni, setDni] = useState('')
  const [alquilerStr, setAlquilerStr] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [saving, setSaving] = useState(false)

  const historial = propiedad.historialContratos
  if (!historial || historial.length === 0) return null

  const ordenado = [...historial].sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))

  function abrirEdicion(c: ContratoHistorico) {
    setEditando(c)
    setNombre(c.inquilinoNombre ?? '')
    setEmail(c.inquilinoEmail ?? '')
    setTelefono(c.inquilinoTelefono ?? '')
    setDni(c.inquilinoDni ?? '')
    setAlquilerStr(c.alquilerMensual != null ? c.alquilerMensual.toString() : '')
    setFechaInicio(c.fechaInicio ?? '')
    setFechaFin(c.fechaFin)
  }

  async function handleGuardar() {
    if (saving || !editando) return
    const alquilerParseado = parseImporte(alquilerStr)
    if (alquilerStr.trim() && Number.isNaN(alquilerParseado)) {
      showToast('Importe de alquiler inválido')
      return
    }
    if (!fechaFin) {
      showToast('La fecha de fin es obligatoria')
      return
    }
    setSaving(true)
    try {
      const actualizado: ContratoHistorico = {
        ...editando,
        inquilinoNombre: nombre.trim() || undefined,
        inquilinoEmail: email.trim() || undefined,
        inquilinoTelefono: telefono.trim() || undefined,
        inquilinoDni: dni.trim() || undefined,
        alquilerMensual: alquilerStr.trim() ? alquilerParseado : undefined,
        fechaInicio: fechaInicio || undefined,
        fechaFin,
      }
      await updateProp({
        ...propiedad,
        historialContratos: (propiedad.historialContratos ?? []).map((c) =>
          c.id === actualizado.id ? actualizado : c,
        ),
      })
      setEditando(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-outline-variant uppercase tracking-wide">
          Historial de alquileres
        </span>
        <div className="flex flex-col gap-2">
          {ordenado.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => abrirEdicion(c)}
              className="text-left bg-surface-low rounded-xl px-4 py-3 flex flex-col gap-1 hover:brightness-95 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-on-surface truncate">
                  {c.inquilinoNombre || 'Inquilino sin nombre'}
                </span>
                {c.alquilerMensual != null && (
                  <span className="text-xs text-outline-variant flex-shrink-0">
                    {fmt(c.alquilerMensual)} €/mes
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-outline-variant">
                  {c.fechaInicio ? format(parseISO(c.fechaInicio), 'd MMM yyyy', { locale: es }) : '?'}
                  {' – '}
                  {format(parseISO(c.fechaFin), 'd MMM yyyy', { locale: es })}
                </span>
                {c.contratoArchivoId && (
                  <a
                    href={`https://drive.google.com/file/d/${c.contratoArchivoId}/view`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-primary ml-auto"
                  >
                    <FileText size={12} />
                    Contrato
                  </a>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <BottomSheet
        open={editando !== null}
        onClose={() => setEditando(null)}
        title="Editar alquiler anterior"
      >
        <div className="flex flex-col gap-4 pb-4">
          <p className="text-xs text-outline-variant">
            Este contrato ya está cerrado — aquí solo corriges datos que faltaran o
            estuvieran mal. Para generar una factura o recibo que te faltara, hazlo
            desde el movimiento correspondiente en Movimientos, sigue disponible
            aunque la propiedad ya no esté alquilada.
          </p>
          <Input label="Nombre del inquilino" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <Input label="DNI/NIE" value={dni} onChange={(e) => setDni(e.target.value)} />
          <Input
            label="Alquiler mensual (€)"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={alquilerStr}
            onChange={(e) => setAlquilerStr(e.target.value)}
          />
          <div className="flex gap-3">
            <Input
              label="Inicio"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
            <Input
              label="Fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleGuardar} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
