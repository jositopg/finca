import { useState } from 'react'
import { Building2, Download, FileSpreadsheet, Receipt, RefreshCw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAccionesGlobales } from '../hooks/useAccionesGlobales'
import { BottomSheet } from './BottomSheet'
import { DatosFacturacionForm } from './DatosFacturacionForm'
import { NAV_ITEMS, type View } from './Nav'

interface Props {
  current: View
  onChange: (v: View) => void
}

/** Barra de navegación superior — solo escritorio (≥lg). Contiene el wordmark,
 *  las secciones como pestañas horizontales y las acciones globales que en
 *  móvil viven en la cabecera del Dashboard. */
export function TopBar({ current, onChange }: Props) {
  const { datosFacturacion, guardarDatosFacturacion } = useApp()
  const { exportarSheets, exportarJSON, exporting, refreshData, isLoadingData, hayPropiedades } =
    useAccionesGlobales()
  const [showDatosFacturacion, setShowDatosFacturacion] = useState(false)

  return (
    <header className="hidden lg:block sticky top-0 z-40 bg-surface-lowest border-b border-surface-high">
      <div className="max-w-content mx-auto px-8 h-16 flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary-container flex items-center justify-center">
            <Building2 size={17} className="text-primary" />
          </div>
          <span className="font-display text-lg font-bold text-on-surface">Finca</span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = current === id
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary-container text-primary'
                    : 'text-outline-variant hover:bg-surface-low hover:text-on-surface'
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 1.75} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={exportarSheets}
            disabled={exporting || !hayPropiedades}
            title="Exportar a Google Sheets"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low hover:text-on-surface transition-colors disabled:opacity-40"
          >
            <FileSpreadsheet size={17} className={exporting ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={exportarJSON}
            title="Exportar copia de seguridad (JSON)"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low hover:text-on-surface transition-colors"
          >
            <Download size={17} />
          </button>
          <button
            onClick={() => setShowDatosFacturacion(true)}
            title="Mis datos de facturación"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low hover:text-on-surface transition-colors"
          >
            <Receipt size={17} />
          </button>
          <button
            onClick={refreshData}
            title="Refrescar"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-outline-variant hover:bg-surface-low hover:text-on-surface transition-colors"
          >
            <RefreshCw size={17} className={isLoadingData ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <BottomSheet
        open={showDatosFacturacion}
        onClose={() => setShowDatosFacturacion(false)}
        title="Mis datos de facturación"
      >
        <DatosFacturacionForm
          initial={datosFacturacion}
          onSave={async (d) => {
            await guardarDatosFacturacion(d)
            setShowDatosFacturacion(false)
          }}
          onCancel={() => setShowDatosFacturacion(false)}
        />
      </BottomSheet>
    </header>
  )
}
