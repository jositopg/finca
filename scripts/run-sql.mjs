// Ejecuta SQL directo contra Postgres usando SUPABASE_DB_URL (en .env.local,
// nunca commiteado). Para cambios de esquema (columnas, índices, RLS...) que
// PostgREST/supabase-js no pueden hacer.
//
// Uso: node scripts/run-sql.mjs "ALTER TABLE propiedades ADD COLUMN x text;"
//   o: node scripts/run-sql.mjs archivo.sql

import { readFileSync, existsSync } from 'node:fs'
import { Client } from 'pg'

function loadEnvLocal() {
  const path = new URL('../.env.local', import.meta.url)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

async function main() {
  loadEnvLocal()
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) throw new Error('Falta SUPABASE_DB_URL en .env.local')

  const arg = process.argv[2]
  if (!arg) throw new Error('Uso: node scripts/run-sql.mjs "<SQL>" | archivo.sql')
  const sql = existsSync(arg) ? readFileSync(arg, 'utf8') : arg

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const res = await client.query(sql)
    const results = Array.isArray(res) ? res : [res]
    for (const r of results) {
      if (r.rows?.length) console.table(r.rows)
      else console.log(`OK (${r.command}, ${r.rowCount ?? 0} filas)`)
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
