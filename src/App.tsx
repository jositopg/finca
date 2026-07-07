import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { LoginView } from './views/LoginView'
import { DashboardView } from './views/DashboardView'
import { PropiedadesView } from './views/PropiedadesView'
import { TransaccionesView } from './views/TransaccionesView'
import { Nav, type View } from './components/Nav'
import { Building2 } from 'lucide-react'

function Shell() {
  const { authState, isLoadingData } = useApp()
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

  if (isLoadingData && !['dashboard', 'propiedades', 'transacciones'].includes(view)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-outline-variant">Cargando datos...</p>
      </div>
    )
  }

  return (
    <>
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
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
