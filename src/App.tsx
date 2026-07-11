import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { LoginView } from './views/LoginView'
import { DashboardView } from './views/DashboardView'
import { PropiedadesView } from './views/PropiedadesView'
import { TransaccionesView } from './views/TransaccionesView'
import { FiscalView } from './views/FiscalView'
import { Nav, type View } from './components/Nav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Building2, WifiOff } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

function Shell() {
  const { authState, isLoadingData, usingCache, cacheDate } = useApp()
  const [view, setView] = useState<View>('dashboard')
  const [selectedPropId, setSelectedPropId] = useState<string | undefined>()

  if (authState === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary-container flex items-center justify-center">
          <Building2 size={24} className="text-primary" />
        </div>
        <p className="text-sm text-outline-variant">Conectando...</p>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginView />
  }

  if (isLoadingData && !['dashboard', 'propiedades', 'transacciones', 'fiscal'].includes(view)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-outline-variant">Cargando datos...</p>
      </div>
    )
  }

  return (
    <>
      {usingCache && (
        <div className="bg-warning-container text-warning text-xs font-medium px-4 py-2 flex items-center gap-2 justify-center">
          <WifiOff size={13} />
          Sin conexión — datos de{' '}
          {cacheDate ? format(parseISO(cacheDate), "d MMM 'a las' HH:mm", { locale: es }) : 'antes'}
        </div>
      )}
      <ErrorBoundary key={view}>
        {view === 'dashboard' && (
          <DashboardView
            onNavigate={(v, propId) => {
              setView(v)
              if (propId) setSelectedPropId(propId)
            }}
          />
        )}
        {view === 'propiedades' && (
          <PropiedadesView
            selectedId={selectedPropId}
            onSelectId={(id) => setSelectedPropId(id)}
          />
        )}
        {view === 'transacciones' && <TransaccionesView />}
        {view === 'fiscal' && <FiscalView />}
      </ErrorBoundary>

      <Nav
        current={view}
        onChange={(v) => {
          setView(v)
          if (v !== 'propiedades') setSelectedPropId(undefined)
        }}
      />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ToastProvider>
  )
}
