-- Auditoría 2026-09: columnas nuevas, unique de gastos fijos y nº de factura.

ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS dia_cobro smallint;
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS fianza_deposito_numero text;
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS fianza_deposito_archivo_id text;
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS fianza_deposito_archivo_nombre text;
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS seguro_vencimiento date;
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS ibi_mes smallint;
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS huecos_mensuales_omitidos jsonb;

ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS gasto_recurrente_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS transacciones_recurrente_mes
  ON transacciones (propiedad_id, gasto_recurrente_id, fecha)
  WHERE gasto_recurrente_id IS NOT NULL;

-- UNIQUE(numero_factura) no se aplica: ya hay un F-2026-001 duplicado en
-- producción. La generación nueva usa el año del movimiento y comprueba
-- el array en memoria; no se tocan números ya emitidos.

NOTIFY pgrst, 'reload schema';
