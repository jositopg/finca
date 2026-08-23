# Finca

> **Mantenimiento de este archivo — leer siempre**: cada vez que hagas un cambio estructural en la app (nuevo campo de datos, nueva tabla/columna en Supabase, nueva vista o pestaña, un cambio de convención como los de la sección de abajo, una limitación nueva descubierta), actualiza este archivo en el mismo commit. El objetivo es que cualquier sesión nueva — incluida una abierta desde el móvil vía `claude remote-control` — entienda el core de la app sin depender del historial de conversaciones anteriores. Sé conciso: esto es una foto del estado actual y las convenciones vivas, no un diario de sesiones — si algo queda obsoleto, corrígelo o bórralo en vez de apilarlo.

App personal de Jose para gestionar y llevar la contabilidad de sus propiedades inmobiliarias (pisos, casas, locales, garajes) en alquiler u otros usos — algunas suyas, alguna gestionada por cuenta de un tercero ("Martín"). Uso exclusivo personal de Jose, con datos fiscales reales — prioriza siempre robustez y no perder/corromper datos por encima de features nuevas.

Repo `jositopg/finca`, desplegado en Vercel: `https://lasfincas.vercel.app`.

## Stack

React 19 + TypeScript + Vite + Tailwind CSS. PWA (manifest, service worker, iconos). Sin librería de gráficos — los gráficos se hacen a mano en SVG/divs.

- `npm run dev` — servidor de desarrollo
- `npm run build` — `tsc -b && vite build` (typecheck + build)
- `npm run lint` — oxlint
- `npm test` — vitest run

Antes de dar cualquier cambio por bueno: `build` + `lint` + `test` limpios.

## Backend: Supabase (Postgres), no Google Sheets

La base de datos vivía en Sheets y se migró por completo a Supabase el 2026-07-07 tras un bug grave de corrupción de datos (direccionamiento por posición de fila). **No reintroducir lógica de direccionamiento por posición.** Sheets/Drive son ahora secundarios:
- **Drive**: solo para archivos (contratos, facturas, adjuntos de gastos). Carpetas organizadas por propiedad → tipo de documento (`Contrato`, `Ingresos/Gastos/{año}/{MM - Mes}`). Si al editar una transacción cambia la propiedad/tipo/mes, `AppContext.updateTx` mueve los archivos ya subidos a la carpeta nueva (`moveFileToFolder` en `src/api/drive.ts`) — no se quedan huérfanos en la carpeta antigua.
- **Sheets**: solo exportación bajo demanda ("Exportar a Sheets" en el Dashboard), con fórmulas reales (SUMIFS/VLOOKUP), no snapshot de valores. No hay sync en vivo ni de vuelta.
- CRUD de propiedades/transacciones: `src/api/db.ts`, habla con Supabase vía `@supabase/supabase-js`. RLS activo, solo el email de Jose puede leer/escribir.
- Login: Supabase Auth con Google (`src/api/auth.ts`).

### Credenciales y cambios de esquema — hacerlo directamente, sin preguntar

- Conexión directa a Postgres en **`/Users/jose/.finca-db.env`** (fuera del repo, `chmod 600`, variable `DATABASE_URL`). **Comprobar siempre primero con `test -f /Users/jose/.finca-db.env`** antes de pedirle nada a Jose — no está en las rutas obvias (`env | grep supabase` no la encuentra, el nombre del fichero no contiene "supabase").
- Para cualquier `ALTER TABLE`/columna nueva/índice: `node scripts/run-sql.mjs "<SQL>"` directamente. Jose pidió explícitamente no tener que entrar al SQL Editor de Supabase ni reenviar la contraseña.
- Tras cada commit en este repo: `git push` sin preguntar.

## Convenciones de código importantes (`src/types/index.ts`)

- **`parseImporte(raw)`**: único parser de importes en toda la app — admite formato español ("1.200,50", "1200", con o sin símbolo €). Nunca usar `parseFloat` suelto. Devuelve `NaN` ante texto inválido (comprobar con `Number.isNaN`, no `<= 0`).
- **`importeEnRango(tx, desde, hasta)`**: usado por todos los totales mensuales/anuales. Prorratea por días si la transacción tiene `periodoInicio`/`periodoFin` (agua/luz, cuyo cobro va por detrás del periodo real). Los **listados de movimientos reales** (no resúmenes) siguen agrupando por `fecha` de pago sin prorratear — la distinción es: totales/resúmenes fiscales sí prorratean, listados de movimientos no.
- **`miParte(importe, propiedad)`**: aplica `porcentajePropiedad` (propiedades a medias con otro dueño). Todos los resúmenes muestran ya la parte de Jose; los movimientos individuales muestran el importe real registrado.
- **`esDeJose(propiedad)`**: excluye propiedades gestionadas por cuenta de terceros de los totales/fiscalidad personal de Jose.
- **`esDeAlquiler(propiedad)`**: excluye `uso_propio`/`vivienda_habitual` de los totales de rendimiento de alquiler (Dashboard, Estadísticas, Fiscal) — esas propiedades sí siguen admitiendo transacciones con normalidad, solo cambia la agregación.
- Patrón "marcar hecho sin tocar el dato real" (`alDiaDesde`, `deudaDesde`, `rentaRevisadaDesde`, `fianzaDepositadaDesde`): campos ISO datetime que se guardan al pulsar un botón, sin abrir formulario ni cambiar ningún otro dato — mismo patrón para features similares futuras.
- **Cualquier `fetch`/promesa de red sin timeout explícito es un bug latente** ("botón que se queda colgado para siempre" en redes móviles lentas). Ya se ha encontrado y arreglado en Drive (`apiGet/Post/Put/Delete`, subida resumable) y en el cliente de Supabase (`fetchConTimeout`). Si aparece de nuevo el síntoma "el botón no responde", mirar timeouts antes que otra causa.

## Navegación (`src/components/Nav.tsx`)

Inicio (Dashboard) · Propiedades · Movimientos (Transacciones) · Estadísticas · Fiscal.

- **Dashboard**: operativo del día a día — resumen del mes/año, tareas pendientes, acceso rápido a facturas de agua/luz, listado de propiedades. **Los avisos (contrato por vencer, revisión de renta, certificado energético, fianza) NO van agregados aquí** — viven dentro de la ficha y tarjeta de cada propiedad.
- **Estadísticas**: gráficos agregados (evolución del rendimiento neto por año, gastos por categoría, ranking de rentabilidad entre propiedades). Cualquier gráfico/estadística agregada nueva va aquí, no en el Dashboard. La app solo empieza a acumular histórico útil desde 2026, así que la evolución anual (`EvolucionAnual`, requiere ≥2 años con datos) no se mostrará hasta que haya suficiente histórico.
- **Fiscal**: datos consolidados para la Renta y el Modelo 420 (IGIC canario) — deliberadamente no calcula el impuesto final, solo consolida cifras. Terminología fiscal en español, Canarias usa IGIC no IVA.

## Limitaciones conocidas

- **No se puede probar login OAuth de Google (Supabase Auth / Drive / Sheets) desde una sesión de agente** — requiere la sesión interactiva del navegador de Jose. Verificar siempre con `build`+`lint`+`test`, y comunicar explícitamente qué queda pendiente de que Jose confirme en la app real.
- El histórico completo de decisiones de producto y sesiones anteriores vive en el sistema de memoria de Jose (fuera de este repo) — si trabajas desde una sesión nueva sin ese historial (p.ej. remote-control con `--spawn=worktree`, o un checkout distinto), este archivo es la referencia de arquitectura, pero puede no reflejar decisiones muy recientes que aún no se hayan volcado aquí.
