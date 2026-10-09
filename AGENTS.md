# Finca (lasfincas)

> **Mantenimiento — leer siempre**: cada vez que hagas un cambio estructural (nuevo campo de datos, nueva tabla o columna en Supabase, nueva vista o pestaña, un cambio de convención, una limitación nueva), actualiza este archivo en el mismo commit. Sirve para cualquier agente y cualquier sesión nueva, sin depender del historial. Es una foto del estado actual, no un diario: si algo queda obsoleto, corrígelo o bórralo.

App personal de Jose para llevar la contabilidad de sus alquileres (pisos, casas, locales, garajes). Algunas propiedades son suyas, alguna la gestiona por cuenta de un tercero ("Martín"). Uso exclusivo, datos fiscales reales. Prioriza no perder ni corromper datos por encima de features nuevas.

Repo `jositopg/finca`. En producción: https://lasfincas.vercel.app. Este archivo es el único briefing. Un encargo concreto manda sobre él en lo que diga explícitamente.

## Stack

React 19, TypeScript ~6, Vite 8, Tailwind 3. PWA (manifest, service worker, iconos). Datos en Supabase (`@supabase/supabase-js`). `date-fns` 4, `lucide-react`. Tests con vitest 4. Lint con oxlint. Sin librería de gráficos: se hacen a mano en SVG o divs.

```bash
npm install
npm run dev
npm test          # vitest run
npm run lint      # oxlint
npm run build     # tsc -b && vite build
```

Un cambio no está listo hasta que test, lint y build salen limpios. El lint ya avisa en `Nav`, `ToastContext` y `AppContext` (`only-export-components`): no añadas otro.

`npm ci` falla: `package-lock.json` no está sincronizado con `package.json` (faltan `@emnapi/*`) y el CI de GitHub sale en rojo por eso. No toques el lock salvo que el encargo lo pida. Si no hay `node_modules`, usa `npm install`.

No hay jsdom ni Testing Library. Los tests son de funciones puras. No añadas dependencias para testear componentes.

## Carpetas

- `src/views` — Inicio, Propiedades, Movimientos, Estadísticas, Fiscal
- `src/components` — hojas y piezas de UI
- `src/context` — `AppContext` (única puerta a `src/api/db.ts`) y toasts
- `src/api` — Supabase, login con Google, Drive, exportación a Sheets
- `src/types` — lógica de dinero sin React (`index.ts`, `cobroRenta.ts`)
- `src/hooks`
- `scripts/` — SQL contra Postgres (`run-sql.mjs`, `scripts/sql/`)
- Encargos escritos: `../briefs/finca/SIGUIENTE.md` (fuera del repo)

## Backend: Supabase (Postgres), no Google Sheets

La base vivía en Sheets y se migró a Supabase el 2026-07-07 tras un bug grave de corrupción (direccionamiento por posición de fila). No reintroducir lógica de direccionamiento por posición. Sheets y Drive son secundarios:

- **Drive**: solo archivos (contratos, facturas, adjuntos). Carpetas por propiedad → tipo (`Contrato`, `Ingresos/Gastos/{año}/{MM - Mes}`). Si al editar una transacción cambia la propiedad, el tipo o el mes, `AppContext.updateTx` mueve los archivos ya subidos (`moveFileToFolder` en `src/api/drive.ts`).
- **Sheets**: solo exportación bajo demanda ("Exportar a Sheets" en el Dashboard), con fórmulas reales (SUMIFS/VLOOKUP), no una foto de valores. No hay sync en vivo ni de vuelta.
- CRUD de propiedades y transacciones: `src/api/db.ts`. RLS activo, solo el email de Jose puede leer y escribir.
- Login: Supabase Auth con Google (`src/api/auth.ts`).

### Credenciales y esquema

- Postgres directo en `/Users/jose/.finca-db.env` (fuera del repo, `chmod 600`, variable `DATABASE_URL`). Comprobar antes con `test -f /Users/jose/.finca-db.env`. No está en `env | grep supabase`.
- No leas ese fichero en el chat, no copies la URL y no hagas commit de `.env`, `.env.local` ni de ninguna clave. `*.local` está en `.gitignore`.
- Un `ALTER TABLE`, columna nueva o índice va con `node scripts/run-sql.mjs "<SQL>"` directamente. Jose no quiere entrar al SQL Editor ni reenviar la contraseña.
- No borres ni reescribas filas de producción como efecto colateral de otra tarea.

### Push

La app ya está en producción. Tras cada commit en este repo: `git push` sin preguntar.

## Snapshot macro para Fuck You Money

FYM es el balance consolidado (solo lectura del inmobiliario). Esta app no se acopla al CRUD de FYM.

- Vistas: `v_patrimonio_propiedades`, `v_patrimonio_cashflow` (sin PII).
- Función: `patrimonio_macro_snapshot()` → JSON. SQL en `scripts/sql/v_patrimonio_macro.sql`.
- Universo: `propietario_nombre IS NULL` (`esDeJose`). Valor = `valor_mercado` o fallback catastro, × `% propiedad`.
- No hay principal de hipoteca: el snapshot pone `mortgageOutstanding: null`.
- REVOKE a `anon` y `authenticated`. Solo el rol postgres (`DATABASE_URL`) puede leerlo. FYM lo llama desde `/api/sync-finca` con `FINCA_DATABASE_URL`.
- Si cambia este contrato, actualiza también `~/Proyectos/fuck-you-money/HANDOFF.md`.

## Convenciones de código (`src/types/index.ts`)

- **`parseImporte(raw)`**: único parser de importes. Admite formato español ("1.200,50", "1200", con o sin €). Nunca `parseFloat` suelto. Devuelve `NaN` ante texto inválido (`Number.isNaN`, no `<= 0`).
- **`importeEnRango(tx, desde, hasta)`**: totales mensuales y anuales. Prorratea por días si hay `periodoInicio`/`periodoFin` (agua y luz, cuyo cobro va por detrás del periodo). Los listados de movimientos agrupan por `fecha` de pago, sin prorratear.
- **Agua y luz (`reparto.aguaLuz`)**: incluidos / no incluidos / cupo mensual conjunto (p.ej. 30 € de agua+luz juntos). `desgloseSuministrosEnRango`, `resumenEnRango` y `sumGastosEnRango` son la fuente de los totales: la parte no incluida no cuenta como gasto (la factura queda informativa) y sale como `inquilino` para repercutirla. El cupo es por mes civil y conjunto, no por factura. `cuotaSuministro` reparte ese cupo entre las facturas del mes. No se generan ingresos automáticos de "Agua/Electricidad (repercutida)". Si no hay `aguaLuz`, se unifica el legado `reparto.agua`+`reparto.luz` cuando coinciden; si no, cada concepto usa `calcularReparto`. Basuras e IBI siguen por concepto. En Sheets el cupo conjunto mensual no se puede expresar por fila (queda en columnas J/K).
- **`miParte(importe, propiedad, soloMio?)`**: aplica `porcentajePropiedad`. Los resúmenes muestran la parte de Jose; el movimiento individual muestra el importe registrado. `transaccion.soloMio` (checkbox en `TransactionForm`, solo en propiedades a medias) cuenta esa transacción al 100% para Jose. Todo `miParte` sobre una transacción tiene que pasar `t.soloMio`.
- **`esDeJose(propiedad)`**: excluye lo gestionado para terceros de los totales y la fiscalidad personal.
- **`esDeAlquiler(propiedad)`**: excluye `uso_propio` y `vivienda_habitual` de los totales de rendimiento. Esas propiedades siguen admitiendo transacciones.
- **`alquilerACobrar` / `deudaInquilino`**: en locales la deuda y el aviso usan la neta (lo que entra en el banco), no la bruta. Un cobro parcial no cierra el mes (`rentaPendiente` suma importes). `diaCobro` (1-28, default 5) mueve el aviso. El cobro guarda el mes que paga en `periodoInicio`/`periodoFin`; la fecha es cuándo entra el dinero. Un atraso de enero cobrado en marzo no tapa marzo. Cobros viejos sin periodo siguen restando del total.
- **`rendimientoIrpfPropiedad`**: única fuente de Fiscal y del estimador. Excluye fianzas; locales a base imponible; prorratea con `importeEnRango`; no deduce `Hipoteca / Financiación` (sí `Intereses hipoteca`); amortización prorrateada por meses alquilados del año. Agua y luz: solo la parte incluida (`sumGastosEnRango` con `{ irpf: true }`). Los ingresos "Agua/Electricidad (repercutida)" no cuentan como rendimiento.
- **Avisos en Inicio**: `avisosDePropiedad` (renta, fianza ICAVI, contrato, IPC, CEE, seguro, mes IBI). Cobros del mes: `rentaDelMesIncompleta` + `CobrosPendientes`. Cobro de renta: `construirCobroRenta` (`src/types/cobroRenta.ts`) es la única forma de construir la tx; la usan `CobroRenta` y `CobrarVarios` (lote desde Inicio, vuelve a comprobar con `leerTransaccionesServidor` antes de insertar). En un local la neta se guarda sin redondear.
- **Huecos mensuales** (`huecosMensuales`): avisos de renta, agua o luz que no cubren ese mes (por periodo o, si no hay periodo, por fecha). Últimos 6 meses desde la ocupación. Jose puede quitar un aviso (`huecosMensualesOmitidos`, JSONB, columna `huecos_mensuales_omitidos`).
- **Gastos fijos**: `gastoRecurrenteId` + unique index `(propiedad_id, gasto_recurrente_id, fecha)`. `generarGastosPendientes` rellena desde el alta hasta el mes actual, salvo **Tasa de basuras**, que cubre todo el año civil. Si hay tasa fija y no está incluida en la renta, `repartoEfectivo` la trata como no incluida (a repercutir, no como gasto). Las lecturas de Supabase paginan de 1000 en 1000.
- **Caché**: se actualiza tras cada mutación. El logout borra `finca_cache_v1` y revoca el token GIS. El backup JSON incluye ingresos externos, tareas y datos de facturación.
- **Documentos de alquiler**: solo los locales generan factura (serie F, IGIC). Vivienda y garaje no llevan factura ni recibo en la app. El número usa el año del movimiento. Hay un `F-2026-001` duplicado en prod; no hay UNIQUE en la base.
- **`tramosContrato` / `aplicarCambioCondiciones`**: el contrato en vigor puede cambiar renta, fin o fianza desde una fecha sin terminarlo (mismo inquilino, mismo `contratoInicio`). Columna JSONB `tramos_contrato`. Al guardar, `alquilerMensual` y `fianzaImporte` = tramo vigente hoy; `contratoFin` = el del último pacto. `deudaInquilino` y `rentaPendiente` usan `alquilerVigente` mes a mes. Editar la ficha (`corregirTramoVigente`) corrige el tramo de hoy; el cambio fechado es «Cambiar condiciones». Al terminar, los tramos van a `ContratoHistorico.tramos` y se vacían de la propiedad. `PropiedadForm` tiene que preservar `tramosContrato`.
- **`sustituirPorContratoNuevo`**: mismo inquilino, contrato distinto. El actual se archiva en `historialContratos` (la vivienda no pasa a vacío) y la ficha queda con nuevo `contratoInicio`, nuevo fin y renta, sin PDF ni tramos. Distinto de un anexo y de «Terminar contrato». `alquilerVigente` y `deudaInquilino` remontan al contrato archivado si es el mismo inquilino y las fechas son consecutivas (`inicioOcupacionActual`). La fianza depositada se mantiene. Snapshot común: `snapshotContratoActual`.
- Patrón "marcar hecho sin tocar el dato real" (`alDiaDesde`, `deudaDesde`, `rentaRevisadaDesde`, `fianzaDepositadaDesde`): un ISO datetime al pulsar el botón, sin abrir formulario ni cambiar otro dato.
- Cualquier `fetch` sin timeout explícito es un bug latente (el botón se queda colgado en el móvil). Ya está cubierto en Drive (`apiGet/Post/Put/Delete`, subida resumable) y en Supabase (`fetchConTimeout`). Si un botón no responde, mirar timeouts antes que otra causa.

## Layout: móvil y escritorio

Mobile-first. El único corte es `lg` de Tailwind (≥1024 px) = escritorio. Por debajo, columna única, `#root` topado a 480 px en `src/index.css`, barra inferior `Nav`. El rango 481–1023 px mantiene la card centrada.

- No tocar el render móvil. El escritorio se hace solo con variantes `lg:`, o tras `useIsDesktop()` (`src/hooks/useMediaQuery.ts`). Si un `lg:` cambia el orden del DOM, compensar en móvil con `order-*` (`DashboardView`, `TransaccionesView`).
- `src/components/TopBar.tsx` (`hidden lg:block`): barra superior de escritorio. En móvil esas acciones siguen en la cabecera del Dashboard (`lg:hidden`). `NAV_ITEMS` se exporta desde `Nav.tsx`.
- `src/hooks/useAccionesGlobales.ts`: exportar a Sheets y backup JSON, compartido por Dashboard y `TopBar`.
- `App.tsx`: en escritorio `<main>` centra a `lg:max-w-content` (1280 px).
- `BottomSheet` y `ConfirmDialog`: en `lg:` pasan de hoja inferior a modal centrado. Mismo componente.
- Escritorio: Dashboard en 2 columnas (`flex flex-col lg:grid`, wrappers `contents lg:flex`). Movimientos = `TransaccionesTable` (`hidden lg:block`) en vez de `TransactionItem` (`lg:hidden`). Propiedades = master-detail (`PropiedadesSidebar` + `PropiedadesPanel embedded`; en móvil solo el panel). Fiscal y Estadísticas = rejillas `lg:grid`.

## Navegación (`src/components/Nav.tsx`)

Inicio (Dashboard) · Propiedades · Movimientos (Transacciones) · Estadísticas · Fiscal.

- **Dashboard**: el día a día. Resumen del mes y del año, tareas, cobros de renta, acceso a facturas de agua y luz, listado de propiedades. Los avisos (contrato, revisión de renta, certificado energético, fianza) viven en la ficha, no agregados aquí. El agua y la luz a repercutir tampoco se listan en Inicio: están en la ficha.
- **Estadísticas**: gráficos agregados (rendimiento neto por año, gastos por categoría, ranking, agua y luz a repercutir en el año). Cualquier gráfico nuevo va aquí. El histórico útil empieza en 2026, así que `EvolucionAnual` (hace falta más de un año) no se muestra todavía. El a repercutir del año es `RepercutirSuministros`; el operativo, en la ficha (`RepercutirSuministrosFicha`, plegado). La tasa de basuras como gasto fijo se replica en todos los meses del año civil.
- **Fiscal**: cifras para la Renta y el Modelo 420 (IGIC canario). No calcula el impuesto final. Canarias usa IGIC, no IVA. El Modelo 420 resta el `igicSoportado` (campo opcional en gastos de propiedades `local`) solo en locales con renta cobrada ese trimestre.

## Limitaciones conocidas

- El login de Google (Supabase, Drive, Sheets) no se puede probar desde un agente. Hacen falta `build`, `lint` y `test`, y decirle a Jose qué tiene que confirmar en la app.
- El render por debajo de 1024 px no se puede probar desde el navegador de una sesión de agente (la ventana no baja de ~1440 px). El escritorio sí. El móvil se revisa en el código: los `lg:` son aditivos y el orden se conserva con `order-*`.
- Decisiones de producto anteriores que no estén volcadas aquí no se pueden adivinar. Este archivo es la referencia.
- La exportación a Sheets (`setup.ts`) no refleja `soloMio` ni `igicSoportado`. Las hojas derivadas aplican `porcentajePropiedad` por propiedad entera, y tampoco prorratean por periodo facturado. Con locales o propiedades a medias, el Sheet puede no cuadrar con la app.
