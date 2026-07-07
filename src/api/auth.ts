import { supabase } from './supabase'

// ─── Login de la app (Supabase Auth + Google) ─────────────────────────────────
// Esto es lo que decide si el usuario está "dentro" de la app y da acceso a
// las tablas de Supabase (vía RLS). Separado del flujo de abajo, que solo
// concede el token de Drive/Sheets y se pide bajo demanda.

export async function signInWithGoogleSupabase(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOutSupabase(): Promise<void> {
  await supabase.auth.signOut()
}

export async function getCurrentEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.email ?? null
}

export function onAuthStateChange(callback: (email: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user?.email ?? null)
  })
  return () => data.subscription.unsubscribe()
}

// ─── Acceso a Google Drive/Sheets (bajo demanda) ──────────────────────────────
// Se pide la primera vez que hace falta adjuntar un archivo o exportar a
// Sheets — no forma parte del login de la app.

// Minimal Google Identity Services type declarations
interface GisTokenResponse {
  access_token: string
  expires_in: number
  error?: string
}

interface GisTokenClient {
  requestAccessToken(config?: { prompt?: string }): void
}

interface GisOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: GisTokenResponse) => void
  }): GisTokenClient
  revoke(token: string, callback: () => void): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: GisOAuth2
      }
    }
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ')

let tokenClient: GisTokenClient | null = null
let accessToken: string | null = null
let tokenExpiry: number | null = null

function isTokenValid(): boolean {
  return !!accessToken && !!tokenExpiry && Date.now() < tokenExpiry
}

export function getAccessToken(): string | null {
  return isTokenValid() ? accessToken : null
}

export function initTokenClient(
  onSuccess: (token: string) => void,
  onError: (err: unknown) => void,
): void {
  if (!window.google) {
    onError(new Error('Google Identity Services no está cargado'))
    return
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) {
        onError(response)
        return
      }
      accessToken = response.access_token
      tokenExpiry = Date.now() + (response.expires_in - 60) * 1000
      onSuccess(response.access_token)
    },
  })
}

export function requestToken(): void {
  tokenClient?.requestAccessToken({ prompt: '' })
}

export function requestTokenWithConsent(): void {
  tokenClient?.requestAccessToken({ prompt: 'consent' })
}

export function revokeToken(): void {
  if (accessToken) {
    window.google?.accounts.oauth2.revoke(accessToken, () => {})
    accessToken = null
    tokenExpiry = null
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin token de acceso')

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    if (res.status === 401) {
      accessToken = null
      tokenExpiry = null
    }
    throw new Error(`API error ${res.status}: ${await res.text()}`)
  }

  return res.json() as Promise<T>
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin token de acceso')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    if (res.status === 401) {
      accessToken = null
      tokenExpiry = null
    }
    throw new Error(`API error ${res.status}: ${await res.text()}`)
  }

  return res.json() as Promise<T>
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin token de acceso')

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function apiDelete(url: string): Promise<void> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin token de acceso')

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok && res.status !== 204) {
    throw new Error(`API error ${res.status}`)
  }
}
