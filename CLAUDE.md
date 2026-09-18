# Finca

> **Mantenimiento de este archivo — leer siempre**: cada vez que hagas un cambio estructural en la app (nuevo campo de datos, nueva tabla/columna en Supabase, nueva vista o pestaña, un cambio de convención como los de la sección de abajo, una limitación nueva descubierta), actualiza este archivo en el mismo commit. El objetivo es que cualquier sesión nueva — incluida una abierta desde el móvil vía `claude remote-control` — entienda el core de la app sin depender del historial de conversaciones anteriores. Sé conciso: esto es una foto del estado actual y las convenciones vivas, no un diario de sesiones — si algo queda obsoleto, corrígelo o bórralo en vez de apilarlo.

App personal de Jose para gestionar y llevar la contabilidad de sus propiedades inmobiliarias (pisos, casas, locales, garajes) en alquiler u otros usos — algunas suyas, alguna gestionada por cuenta de un tercero ("Martín"). Uso exclusivo personal de Jose, con datos fiscales reales — prioriza siempre robustez y no perder/corromper datos por encima de features nuevas.

Repo `jositopg/finca`, desplegado en Vercel: `https://lasfincas.vercel.app`.

## Snapshot macro para Fuck You Money

FYM es el balance consolidado (solo lectura del inmobiliario). Esta app **no** se acopla al CRUD de FYM.

- Vistas: `v_patrimonio_propiedades`, `v_patrimonio_cashflow` (sin PII).
- Función: `patrimonio_macro_snapshot()` → JSON. SQL en `scripts/sql/v_patrimonio_macro.sql`.
- Universo: `propietario_nombre IS NULL` (`esDeJose`). Valor = `valor_mercado` o fallback catastro, × `% propiedad`.
- **No hay principal de hipoteca** — el snapshot pone `mortgageOutstanding: null`.
- REVOKE a `anon`/`authenticated`. Solo el rol postgres (DATABASE_URL) puede leerlo. FYM llama esto desde `/api/sync-finca` con `FINCA_DATABASE_URL`.
- Tras cambiar este contrato, actualizar también `~/Proyectos/fuck-you-money/HANDOFF.md`.

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
- **`miParte(importe, propiedad, soloMio?)`**: aplica `porcentajePropiedad` (propiedades a medias con otro dueño). Todos los resúmenes muestran ya la parte de Jose; los movimientos individuales muestran el importe real registrado. El tercer argumento es `transaccion.soloMio` — si una transacción concreta lo tiene a `true` (checkbox en `TransactionForm`, solo visible en propiedades a medias), esa transacción cuenta al 100% para Jose ignorando el % de la propiedad (facturas a su nombre personal que no son a medias). Todos los call sites de `miParte` sobre una transacción deben pasar `t.soloMio` — si añades uno nuevo, no se te olvide.
- **`esDeJose(propiedad)`**: excluye propiedades gestionadas por cuenta de terceros de los totales/fiscalidad personal de Jose.
- **`esDeAlquiler(propiedad)`**: excluye `uso_propio`/`vivienda_habitual` de los totales de rendimiento de alquiler (Dashboard, Estadísticas, Fiscal) — esas propiedades sí siguen admitiendo transacciones con normalidad, solo cambia la agregación.
- **`alquilerACobrar` / `deudaInquilino`**: en locales la deuda y el aviso de cobro usan la **neta** (lo que entra en el banco), no la bruta. Un cobro parcial no cierra el mes (`rentaPendiente` suma importes). `diaCobro` (1-28, default 5) mueve el aviso.
- **`rendimientoIrpfPropiedad`**: única fuente de la pestaña Fiscal y del estimador. Excluye fianzas; locales a base imponible; prorratea con `importeEnRango`; no deduce `Hipoteca / Financiación` (sí `Intereses hipoteca`); amortización prorrateada por meses alquilados del año.
- **Avisos en Inicio**: `avisosDePropiedad` (renta, fianza ICAVI, contrato, IPC, CEE, seguro, mes IBI). Cobros del mes: `rentaDelMesIncompleta` + `CobrosPendientes`.
- **Gastos fijos**: `gastoRecurrenteId` en la transacción + unique index `(propiedad_id, gasto_recurrente_id, fecha)` para no duplicar entre dispositivos. Las lecturas de Supabase **paginan** de 1000 en 1000.
- **Caché**: se actualiza tras cada mutación; el logout borra `finca_cache_v1` y revoca el token GIS. El backup JSON incluye ingresos externos, tareas y datos de facturación.
- **Documentos de alquiler**: factura (F) en locales y **recibo (R) en vivienda**. El número usa el año del movimiento, no el calendario de hoy. Hay un `F-2026-001` duplicado en prod — no se ha puesto UNIQUE en DB.
- **`tramosContrato` / `aplicarCambioCondiciones`**: el contrato en vigor puede cambiar renta, fin o fianza a partir de una fecha **sin terminarlo** (mismo inquilino, mismo `contratoInicio`). Columna JSONB `tramos_contrato`. Los campos sueltos se sincronizan al guardar: `alquilerMensual` y `fianzaImporte` = tramo vigente hoy; `contratoFin` = el del último pacto (una renovación futura quita ya el aviso de vencimiento). `deudaInquilino` y `rentaPendiente` usan `alquilerVigente` mes a mes, no la renta actual. Editar la ficha (`corregirTramoVigente`) corrige el tramo de hoy — no crea uno nuevo; el cambio fechado es «Cambiar condiciones» en la ficha. Al terminar, los tramos van a `ContratoHistorico.tramos` y se vacían de la propiedad. `PropiedadForm` tiene que preservar `tramosContrato` al reconstruir el objeto.
- **`sustituirPorContratoNuevo`**: mismo inquilino, **contrato distinto**. El actual se archiva en `historialContratos` (la vivienda no pasa a vacío) y la ficha queda con nuevo `contratoInicio` (nuevo aniversario), nuevo fin/renta y sin PDF ni tramos — hay que adjuntar el contrato nuevo. Distinto de un anexo (`aplicarCambioCondiciones`) y de «Terminar contrato». `alquilerVigente` / `deudaInquilino` remontan al contrato archivado si es el mismo inquilino y las fechas son consecutivas (`inicioOcupacionActual`). La fianza depositada se mantiene. Snapshot común: `snapshotContratoActual`.
- Patrón "marcar hecho sin tocar el dato real" (`alDiaDesde`, `deudaDesde`, `rentaRevisadaDesde`, `fianzaDepositadaDesde`): campos ISO datetime que se guardan al pulsar un botón, sin abrir formulario ni cambiar ningún otro dato — mismo patrón para features similares futuras.
- **Cualquier `fetch`/promesa de red sin timeout explícito es un bug latente** ("botón que se queda colgado para siempre" en redes móviles lentas). Ya se ha encontrado y arreglado en Drive (`apiGet/Post/Put/Delete`, subida resumable) y en el cliente de Supabase (`fetchConTimeout`). Si aparece de nuevo el síntoma "el botón no responde", mirar timeouts antes que otra causa.

## Layout responsive: móvil vs escritorio

La app es **mobile-first**. Hay un único breakpoint que separa los dos modos: **`lg` de Tailwind (≥1024px) = "escritorio"**. Por debajo, todo se renderiza como siempre (columna única, `#root` topado a 480px en `src/index.css`, barra inferior `Nav`). El rango 481–1023px (tablet) mantiene el tratamiento de "card centrada" (`src/index.css`).

- **Regla de oro**: no tocar el render móvil. Los cambios de escritorio se hacen **solo** con variantes `lg:` en el JSX, o gated tras `useIsDesktop()` (`src/hooks/useMediaQuery.ts`). Si un cambio `lg:` altera el orden del DOM, compensarlo en móvil con clases `order-*` (ver `DashboardView`, `TransaccionesView`).
- **`src/components/TopBar.tsx`** (`hidden lg:block`): barra superior horizontal de escritorio — wordmark + 5 secciones como pestañas + acciones globales (exportar Sheets/JSON, datos de facturación, refrescar). En móvil esas acciones siguen en la cabecera del Dashboard (`lg:hidden`). `NAV_ITEMS` se exporta desde `Nav.tsx` y lo comparten `Nav` y `TopBar`.
- **`src/hooks/useAccionesGlobales.ts`**: lógica compartida de exportar a Sheets / backup JSON, consumida por Dashboard (móvil) y `TopBar` (escritorio) — no duplicar.
- **`App.tsx`**: en escritorio, `<main>` centra el contenido a `lg:max-w-content` (1280px, en `tailwind.config.js`).
- **`BottomSheet` / `ConfirmDialog`**: en `lg:` pasan de hoja inferior a modal centrado (`lg:items-center`, `lg:rounded-2xl`). Mismo componente y API.
- **Vistas en escritorio**: Dashboard = 2 columnas (`flex flex-col lg:grid`, con wrappers `contents lg:flex` para que las columnas apilen independientes sin compartir alto de fila). Movimientos = `TransaccionesTable` (`hidden lg:block`) en vez de las tarjetas `TransactionItem` (`lg:hidden`). Propiedades = master-detail: `PropiedadesView` es un wrapper que en escritorio renderiza `PropiedadesSidebar` (lista) + `PropiedadesPanel embedded` (ficha); en móvil solo `PropiedadesPanel`. Fiscal/Estadísticas = rejillas `lg:grid`.

## Navegación (`src/components/Nav.tsx`)

Inicio (Dashboard) · Propiedades · Movimientos (Transacciones) · Estadísticas · Fiscal.

- **Dashboard**: operativo del día a día — resumen del mes/año, tareas pendientes, acceso rápido a facturas de agua/luz, listado de propiedades. **Los avisos (contrato por vencer, revisión de renta, certificado energético, fianza) NO van agregados aquí** — viven dentro de la ficha y tarjeta de cada propiedad.
- **Estadísticas**: gráficos agregados (evolución del rendimiento neto por año, gastos por categoría, ranking de rentabilidad entre propiedades). Cualquier gráfico/estadística agregada nueva va aquí, no en el Dashboard. La app solo empieza a acumular histórico útil desde 2026, así que la evolución anual (`EvolucionAnual`, requiere ≥2 años con datos) no se mostrará hasta que haya suficiente histórico.
- **Fiscal**: datos consolidados para la Renta y el Modelo 420 (IGIC canario) — deliberadamente no calcula el impuesto final, solo consolida cifras. Terminología fiscal en español, Canarias usa IGIC no IVA. El Modelo 420 resta del IGIC repercutido el `igicSoportado` (campo opcional en gastos, solo visible en `TransactionForm` para gastos de propiedades tipo `local`) — solo se descuenta en locales con renta cobrada ese trimestre (si no computa ese trimestre, no hay actividad contra la que deducirlo).

## Limitaciones conocidas

- **No se puede probar login OAuth de Google (Supabase Auth / Drive / Sheets) desde una sesión de agente** — requiere la sesión interactiva del navegador de Jose. Verificar siempre con `build`+`lint`+`test`, y comunicar explícitamente qué queda pendiente de que Jose confirme en la app real.
- **No se puede probar el render móvil (<1024px) desde el Chrome de la sesión de agente** — la ventana no baja de ~1440px de viewport. El layout de escritorio (`lg:`) sí se puede verificar visualmente; el móvil se revisa por código (los cambios `lg:` son aditivos y el orden se preserva con `order-*`).
- El histórico completo de decisiones de producto y sesiones anteriores vive en el sistema de memoria de Jose (fuera de este repo) — si trabajas desde una sesión nueva sin ese historial (p.ej. remote-control con `--spawn=worktree`, o un checkout distinto), este archivo es la referencia de arquitectura, pero puede no reflejar decisiones muy recientes que aún no se hayan volcado aquí.
- **Exportación a Sheets (`setup.ts`) no refleja `soloMio` ni `igicSoportado`**: las hojas derivadas (Resumen, Movimientos, Modelo 420) usan fórmulas SUMIFS/VLOOKUP que aplican el `porcentajePropiedad` de forma uniforme por propiedad — no hay (todavía) una columna en "Movimientos" que las fórmulas puedan usar para saltarse ese reparto transacción a transacción, ni para restar el IGIC soportado del repercutido. Mismo tipo de límite ya conocido con el prorrateo por periodo facturado (ver más abajo). Si Jose usa alguno de los dos con locales/propiedades a medias, el Sheet exportado puede no cuadrar con la app hasta que se revisiten esas fórmulas.
