import { useState } from 'react'
import { format } from 'date-fns'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { exportarASheets } from '../api/setup'

/**
 * Acciones globales de la app (exportar a Sheets, backup JSON, refrescar) —
 * compartidas entre la cabecera del Dashboard (móvil) y la `TopBar` (escritorio)
 * para no duplicar la lógica. La UI de cada sitio decide cómo presentarlas.
 */
export function useAccionesGlobales() {
  const {
    propiedades,
    transacciones,
    ingresosExternos,
    tareas,
    datosFacturacion,
    isLoadingData,
    refreshData,
    ensureDriveAccess,
  } = useApp()
  const { showToast } = useToast()
  const [exporting, setExporting] = useState(false)

  function exportarJSON() {
    const data = {
      exportadoEn: new Date().toISOString(),
      propiedades,
      transacciones,
      ingresosExternos,
      tareas,
      datosFacturacion,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finca-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Copia de seguridad descargada', 'success')
  }

  async function exportarSheets() {
    setExporting(true)
    try {
      await ensureDriveAccess()
      const { url } = await exportarASheets(propiedades, transacciones, ingresosExternos)
      window.open(url, '_blank')
      showToast('Exportado a Google Sheets', 'success')
    } catch (err) {
      console.error('Export to Sheets error', err)
      showToast('No se pudo exportar a Google Sheets. Inténtalo de nuevo.')
    } finally {
      setExporting(false)
    }
  }

  return {
    exportarJSON,
    exportarSheets,
    exporting,
    refreshData,
    isLoadingData,
    hayPropiedades: propiedades.length > 0,
  }
}
