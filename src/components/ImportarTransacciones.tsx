import { useMemo, useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Select } from './Input'
import { parseFilasImportadas, type Propiedad, type Transaccion } from '../types'

interface Props {
  propiedades: Propiedad[]
  trigger?: (open: () => void) => React.ReactNode
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function uuid() {
  return crypto.randomUUID()
}

const EJEMPLO = '2026-01-05\tingreso\tAlquiler mensual\t800\tEnero\n2026-01-10\tgasto\tComunidad de propietarios\t45,50'

// Alta masiva de movimientos pegando varias líneas de golpe — pensado para
// meter meses atrasados de una propiedad sin pasar por el formulario uno a
// uno. Acepta texto copiado de Excel/Sheets (columnas separadas por
// tabulador) o un CSV con punto y coma. Cada línea se valida por separado y
// se puede importar aunque alguna tenga error — esas simplemente se quedan
// fuera del lote.
export function ImportarTransacciones({ propiedades, trigger }: Props) {
  const { addTxs } = useApp()
  const [open, setOpen] = useState(false)
  const [propiedadId, setPropiedadId] = useState(propiedades[0]?.id ?? '')
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)

  function abrir() {
    setPropiedadId(propiedades[0]?.id ?? '')
    setTexto('')
    setOpen(true)
  }

  const filas = useMemo(() => parseFilasImportadas(texto), [texto])
  const validas = filas.filter((f) => f.ok)
  const erroneas = filas.filter((f) => !f.ok)

  async function handleImportar() {
    if (saving || validas.length === 0 || !propiedadId) return
    setSaving(true)
    try {
      const nuevas: Transaccion[] = validas.map((f) => {
        if (!f.ok) throw new Error('unreachable')
        return {
          id: uuid(),
          propiedadId,
          fecha: f.fecha,
          tipo: f.tipo,
          importe: f.importe,
          categoria: f.categoria,
          descripcion: f.descripcion,
          archivos: [],
          creadoEn: new Date().toISOString(),
        }
      })
      await addTxs(nuevas)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {trigger ? (
        trigger(abrir)
      ) : (
        <Button variant="secondary" size="sm" onClick={abrir}>
          <ClipboardPaste size={14} />
          Importar
        </Button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Importar varios movimientos">
        <div className="flex flex-col gap-4 pb-4">
          <p className="text-xs text-outline-variant">
            Pega varias líneas de golpe — una transacción por línea, con estas columnas separadas por
            tabulador (al copiar de Excel/Sheets) o por punto y coma: fecha, tipo (ingreso/gasto),
            categoría, importe, descripción (opcional). Fechas en AAAA-MM-DD o DD/MM/AAAA.
          </p>

          <Select label="Propiedad" value={propiedadId} onChange={(e) => setPropiedadId(e.target.value)}>
            {propiedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-on-surface">Movimientos a importar</label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={EJEMPLO}
              rows={6}
              className="w-full bg-surface-low border-0 rounded-xl px-3 py-2.5 text-sm font-mono text-on-surface placeholder:text-outline-variant/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {filas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-outline-variant">
                {validas.length} línea{validas.length === 1 ? '' : 's'} lista
                {validas.length === 1 ? '' : 's'}
                {erroneas.length > 0 && ` · ${erroneas.length} con error`}
              </p>

              <div className="bg-surface-low rounded-xl divide-y divide-surface-high max-h-64 overflow-y-auto">
                {filas.map((f) =>
                  f.ok ? (
                    <div key={f.linea} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="text-on-surface">{f.fecha}</span>{' '}
                        <span className="text-outline-variant">
                          · {f.tipo} · {f.categoria}
                          {f.descripcion ? ` · ${f.descripcion}` : ''}
                        </span>
                      </div>
                      <span
                        className={`tabular-nums flex-shrink-0 ${f.tipo === 'ingreso' ? 'text-success' : 'text-on-surface'}`}
                      >
                        {f.tipo === 'ingreso' ? '+' : '-'}
                        {fmt(f.importe)} €
                      </span>
                    </div>
                  ) : (
                    <div key={f.linea} className="px-3 py-2 text-xs">
                      <span className="text-error font-medium">Línea {f.linea}: {f.error}</span>
                      <p className="text-outline-variant truncate mt-0.5 font-mono">{f.raw}</p>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              fullWidth
              onClick={handleImportar}
              disabled={saving || validas.length === 0 || !propiedadId}
            >
              {saving ? 'Importando...' : `Importar ${validas.length || ''} movimiento${validas.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
