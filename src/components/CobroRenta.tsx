import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Input } from './Input'
import {
  alquilerVigente,
  calcularRentaLocal,
  deudaInquilino,
  parseImporte,
  type Propiedad,
  type Transaccion,
} from '../types'

interface Props {
  propiedad: Propiedad
  transacciones: Transaccion[]
}

function uuid() {
  return crypto.randomUUID()
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CobroRenta({ propiedad, transacciones }: Props) {
  const { addTx } = useApp()
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const esLocal = propiedad.tipo === 'local'
  const [rentaBrutaStr, setRentaBrutaStr] = useState('')

  const alquilerDeLaFecha = alquilerVigente(propiedad, fecha)
  if (alquilerDeLaFecha == null && alquilerVigente(propiedad) == null) return null

  const deuda = deudaInquilino(propiedad, transacciones)
  const alquiler = alquilerDeLaFecha ?? alquilerVigente(propiedad) ?? 0

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
      const descripcion = desglose
        ? `Base ${fmt(desglose.base)} € · IGIC +${fmt(desglose.igic)} € · IRPF -${fmt(desglose.irpf)} €`
        : ''
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
          const hoy = format(new Date(), 'yyyy-MM-dd')
          setFecha(hoy)
          const alquilerHoy = alquilerVigente(propiedad, hoy) ?? alquilerVigente(propiedad)
          setRentaBrutaStr(alquilerHoy != null ? alquilerHoy.toString() : '')
          setOpen(true)
        }}
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-success-container text-success text-sm font-semibold hover:brightness-95 transition-all"
      >
        <Wallet size={16} />
        Cobro de renta
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
            alquilerDeLaFecha != null &&
            alquilerVigente(propiedad) != null &&
            alquilerDeLaFecha !== alquilerVigente(propiedad) && (
              <p className="text-xs text-outline-variant -mt-2">
                En esta fecha aplica {fmt(alquilerDeLaFecha)} €/mes (el contrato
                tiene un cambio de condiciones).
              </p>
            )}

          {deuda && (
            <p className="text-xs text-warning bg-warning-container/40 rounded-xl px-4 py-2.5">
              Antes de este cobro, el inquilino debe {fmt(deuda.importe)} € (aprox.{' '}
              {deuda.meses.toFixed(1)} meses) de mensualidades anteriores.
            </p>
          )}

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
