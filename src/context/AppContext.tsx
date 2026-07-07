import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getAccessToken,
  initTokenClient,
  requestToken,
  requestTokenWithConsent,
  revokeToken,
} from '../api/auth'
import { setupSpreadsheet } from '../api/setup'
import {
  addPropiedad,
  addTransaccion,
  deletePropiedad,
  deleteTransaccion,
  getSheetMeta,
  getPropiedades,
  getTransacciones,
  migrateHeaders,
  saveSheetMeta,
  type SheetMeta,
  updatePropiedad,
  updateTransaccion,
} from '../api/sheets'
import { getOrCreateFolder } from '../api/drive'
import type { Propiedad, Transaccion } from '../types'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

interface AppContextValue {
  authState: AuthState
  sheetMeta: SheetMeta | null
  propiedades: Propiedad[]
  transacciones: Transaccion[]
  isLoadingData: boolean
  login: () => void
  logout: () => void
  refreshData: () => Promise<void>
  addProp: (p: Propiedad) => Promise<void>
  updateProp: (p: Propiedad) => Promise<void>
  deleteProp: (id: string) => Promise<void>
  addTx: (t: Transaccion) => Promise<void>
  updateTx: (t: Transaccion) => Promise<void>
  deleteTx: (id: string) => Promise<void>
  ensurePropFolder: (propiedadId: string, nombre: string) => Promise<string>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [sheetMeta, setSheetMeta] = useState<SheetMeta | null>(null)
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const gisReady = useRef(false)

  const initGIS = useCallback(() => {
    initTokenClient(
      async (token) => {
        if (!token) return
        setAuthState('authenticated')

        // First time setup or reconnect
        let meta = getSheetMeta()
        if (!meta) {
          setIsLoadingData(true)
          try {
            meta = await setupSpreadsheet()
            setSheetMeta(meta)
          } catch (err) {
            console.error('Setup failed', err)
            setAuthState('unauthenticated')
            return
          } finally {
            setIsLoadingData(false)
          }
        } else {
          setSheetMeta(meta)
        }

        // Migrate sheet headers if needed (silent, best-effort)
        migrateHeaders(meta.spreadsheetId).catch(() => {})

        await loadData(meta.spreadsheetId)
      },
      (err) => {
        console.error('Auth error', err)
        setAuthState('unauthenticated')
      },
    )
    gisReady.current = true
  }, [])

  useEffect(() => {
    // Fallback: si después de 8s no carga GIS, mostramos la pantalla de login
    const fallback = setTimeout(() => setAuthState('unauthenticated'), 8000)

    const checkGIS = () => {
      if (window.google?.accounts?.oauth2) {
        clearTimeout(fallback)
        initGIS()
        if (getAccessToken()) {
          setAuthState('authenticated')
          const meta = getSheetMeta()
          if (meta) {
            setSheetMeta(meta)
            loadData(meta.spreadsheetId)
          }
        } else {
          // Sin sesión previa → siempre mostrar login
          setAuthState('unauthenticated')
        }
      } else {
        setTimeout(checkGIS, 100)
      }
    }
    checkGIS()
    return () => clearTimeout(fallback)
  }, [initGIS])

  async function loadData(spreadsheetId: string) {
    setIsLoadingData(true)
    try {
      const [props, txs] = await Promise.all([
        getPropiedades(spreadsheetId),
        getTransacciones(spreadsheetId),
      ])
      setPropiedades(props)
      setTransacciones(txs)
    } catch (err) {
      console.error('Load data error', err)
    } finally {
      setIsLoadingData(false)
    }
  }

  const refreshData = useCallback(async () => {
    if (!sheetMeta) return
    await loadData(sheetMeta.spreadsheetId)
  }, [sheetMeta])

  const login = useCallback(() => {
    if (!gisReady.current) return
    if (getSheetMeta()) {
      requestToken()
    } else {
      requestTokenWithConsent()
    }
  }, [])

  const logout = useCallback(() => {
    revokeToken()
    setPropiedades([])
    setTransacciones([])
    setSheetMeta(null)
    setAuthState('unauthenticated')
  }, [])

  const addProp = useCallback(
    async (p: Propiedad) => {
      if (!sheetMeta) return
      await addPropiedad(sheetMeta.spreadsheetId, p)
      setPropiedades((prev) => [...prev, p])
    },
    [sheetMeta],
  )

  const updateProp = useCallback(
    async (p: Propiedad) => {
      if (!sheetMeta) return
      await updatePropiedad(sheetMeta.spreadsheetId, p)
      setPropiedades((prev) => prev.map((x) => (x.id === p.id ? p : x)))
    },
    [sheetMeta],
  )

  const deleteProp = useCallback(
    async (id: string) => {
      if (!sheetMeta) return
      await deletePropiedad(sheetMeta.spreadsheetId, id)
      setPropiedades((prev) => prev.filter((x) => x.id !== id))
      setTransacciones((prev) => prev.filter((t) => t.propiedadId !== id))
    },
    [sheetMeta],
  )

  const addTx = useCallback(
    async (t: Transaccion) => {
      if (!sheetMeta) return
      await addTransaccion(sheetMeta.spreadsheetId, t)
      setTransacciones((prev) => [t, ...prev])
    },
    [sheetMeta],
  )

  const updateTx = useCallback(
    async (t: Transaccion) => {
      if (!sheetMeta) return
      await updateTransaccion(sheetMeta.spreadsheetId, t)
      setTransacciones((prev) => prev.map((x) => (x.id === t.id ? t : x)))
    },
    [sheetMeta],
  )

  const deleteTx = useCallback(
    async (id: string) => {
      if (!sheetMeta) return
      await deleteTransaccion(sheetMeta.spreadsheetId, id)
      setTransacciones((prev) => prev.filter((x) => x.id !== id))
    },
    [sheetMeta],
  )

  const ensurePropFolder = useCallback(
    async (propiedadId: string, nombre: string): Promise<string> => {
      if (!sheetMeta) throw new Error('No hay sesión activa')
      const propiedad = propiedades.find((p) => p.id === propiedadId)
      if (propiedad?.folderId) return propiedad.folderId

      const folder = await getOrCreateFolder(nombre, sheetMeta.rootFolderId)
      const updated = { ...propiedad!, folderId: folder.id }
      await updatePropiedad(sheetMeta.spreadsheetId, updated)
      setPropiedades((prev) => prev.map((p) => (p.id === propiedadId ? updated : p)))
      saveSheetMeta(sheetMeta)
      return folder.id
    },
    [sheetMeta, propiedades],
  )

  return (
    <AppContext.Provider
      value={{
        authState,
        sheetMeta,
        propiedades,
        transacciones,
        isLoadingData,
        login,
        logout,
        refreshData,
        addProp,
        updateProp,
        deleteProp,
        addTx,
        updateTx,
        deleteTx,
        ensurePropFolder,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
