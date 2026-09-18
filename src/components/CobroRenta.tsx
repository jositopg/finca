import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import {
  alquilerACobrar,
  alquilerVigente,
  calcularRentaLocal,
  cobradoAlquilerEnMes,
  deudaInquilino,
  mesAlquilerMasAntiguoPendiente,
  parseImporte,
  rangoMesCivil,
  type Propiedad,
  type Transaccion,
} from '../types'

interface Props {
  propiedad: Propiedad
  transacciones: Transaccion[]
  triggerLabel?: string
}

function uuid() {
  return crypto.randomUUID()
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CobroRenta({ propiedad, transacciones, triggerLabel = 'Cobro de renta' }: Props) {
  const { addTx } = useApp()
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [mesPagado, setMesPagado] = useState(format(new Date(), 'yyyy-MM'))
  const [saving, setSaving] = useState(false)
  const esLocal = propiedad.tipo === 'local'
  const [rentaBrutaStr, setRentaBrutaStr] = useState('')

  const diaMes = `${mesPagado}-01`
  const alquilerDelMes = alquilerVigente(propiedad, diaMes)
  if (alquilerDelMes == null && alquilerVigente(propiedad) == null && alquilerACobrar(propiedad) == null) {
    return null
  }

  const yaHayCobroEsteMes =
    cobradoAlquilerEnMes(propiedad.id, transacciones, mesPagado) > 0.005
  const deuda = deudaInquilino(propiedad, transacciones)
  const alquiler = alquilerDelMes ?? alquilerVigente(propiedad) ?? 0

  const rentaBrutaParseada = parseImporte(rentaBrutaStr)
  const rentaBruta = esLocal
    ? Number.isNaN(rentaBrutaParseada) || !rentaBrutaStr.trim()
      ? alquiler
      : rentaBrutaParseada
    : alquiler
  const desglose = esLocal ? calcularRentaLocal(rentaBruta) : null
  const importe = desglose ? desglose.neta : alquiler

  async function handleConfirm() {
    if (saving) return
    setSaving(true)
    try {
      const periodo = rangoMesCivil(mesPagado)
      const mesTexto = format(new Date(`${periodo.inicio}T00:00:00`), "MMMM yyyy", { locale: es })
      const descripcion = desglose
        ? `${mesTexto} · Base ${fmt(desglose.base)} € · IGIC +${fmt(desglose.igic)} € · IRPF -${fmt(desglose.irpf)} €`
        : mesTexto
      const tx: Transaccion = {
        id: uuid(),
        propiedadId: propiedad.id,
        fecha,
        tipo: 'ingreso',
        importe,
        categoria: 'Alquiler mensual',
        descripcion,
        archivos: [],
        creadoEn: new Date().toISOString(),
        periodoInicio: periodo.inicio,
        periodoFin: periodo.fin,
      }
      await addTx(tx)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => {
          const hoy = new Date()
          const hoyStr = format(hoy, 'yyyy-MM-dd')
          const mes = mesAlquilerMasAntiguoPendiente(propiedad, transacciones, hoy)
          setFecha(hoyStr)
          setMesPagado(mes)
          const bruta = alquilerVigente(propiedad, `${mes}-01`, hoy) ?? alquilerVigente(propiedad)
          setRentaBrutaStr(bruta != null ? bruta.toString() : '')
          setOpen(true)
        }}
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-success-container text-success text-sm font-semibold hover:brightness-95 transition-all"
      >
        <Wallet size={16} />
        {triggerLabel}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Cobro de renta">
        <div className="flex flex-col gap-5 pb-4">
          {esLocal ? (
            <>
              <Input
                label="Renta bruta (base imponible, €)"
                type="text"
                inputMode="decimal"
                placeholder="500"
                value={rentaBrutaStr}
                onChange={(e) => setRentaBrutaStr(e.target.value)}
              />
              {desglose && (
                <div className="bg-surface-low rounded-xl px-4 py-3 flex flex-col gap-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-outline-variant">Base imponible</span>
                    <span className="tabular-nums text-on-surface">{fmt(desglose.base)} €</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-outline-variant">+ IGIC (7%)</span>
                    <span className="tabular-nums text-success">+{fmt(desglose.igic)} €</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-outline-variant">− IRPF (19%)</span>
                    <span className="tabular-nums text-error">-{fmt(desglose.irpf)} €</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-surface-high pt-1.5 mt-0.5 font-bold">
                    <span className="text-on-surface">Neto a cobrar</span>
                    <span className="tabular-nums text-success">{fmt(desglose.neta)} €</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-surface-low rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-outline-variant">Importe</span>
              <span className="text-base font-bold text-success tabular-nums">{fmt(importe)} €</span>
            </div>
          )}
          {propiedad.tramosContrato &&
            propiedad.tramosContrato.length > 0 &&
            alquilerDelMes != null &&
            alquilerVigente(propiedad) != null &&
            alquilerDelMes !== alquilerVigente(propiedad) && (
              <p className="text-xs text-outline-variant -mt-2">
                En ese mes aplica {fmt(alquilerDelMes)} €/mes (el contrato
                tiene un cambio de condiciones).
              </p>
            )}

          {yaHayCobroEsteMes && (
            <p className="text-xs text-warning bg-warning-container/40 rounded-xl px-4 py-2.5">
              Ese mes ya tiene un cobro. Confirma solo si es un pago parcial o un extra.
            </p>
          )}
          {deuda && (
            <p className="text-xs text-warning bg-warning-container/40 rounded-xl px-4 py-2.5">
              Antes de este cobro, el inquilino debe {fmt(deuda.importe)} € (aprox.{' '}
              {deuda.meses.toFixed(1)} meses) de mensualidades anteriores.
            </p>
          )}

          <Input
            label="Mes que paga"
            type="month"
            value={mesPagado}
            onChange={(e) => {
              const mes = e.target.value
              setMesPagado(mes)
              const bruta = alquilerVigente(propiedad, `${mes}-01`) ?? alquilerVigente(propiedad)
              if (esLocal && bruta != null) setRentaBrutaStr(bruta.toString())
            }}
          />
          <Input
            label="Fecha de cobro"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth onClick={handleConfirm} disabled={saving || importe <= 0}>
              {saving ? 'Guardando...' : 'Registrar cobro'}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
