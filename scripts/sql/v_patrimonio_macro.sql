-- Snapshot macro del patrimonio inmobiliario de Jose para fuckyoumoney.
-- Sin PII (inquilinos, DNI, emails, Drive). Sin gestión.
-- Solo propiedades esDeJose (propietario_nombre IS NULL).
-- Equity = valor: Finca no guarda principal de hipoteca.

CREATE OR REPLACE VIEW public.v_patrimonio_propiedades AS
SELECT
  p.id,
  p.nombre,
  p.tipo,
  p.estado,
  p.municipio,
  COALESCE(p.porcentaje_propiedad, 100)::numeric AS ownership_pct,
  p.valor_mercado,
  p.valor_referencia,
  p.alquiler_mensual,
  CASE
    WHEN p.valor_mercado IS NOT NULL THEN p.valor_mercado
    ELSE p.valor_referencia
  END AS gross_value,
  CASE
    WHEN p.valor_mercado IS NOT NULL THEN 'mercado'
    WHEN p.valor_referencia IS NOT NULL THEN 'catastro'
    ELSE NULL
  END AS value_source,
  ROUND(
    (
      CASE
        WHEN p.valor_mercado IS NOT NULL THEN p.valor_mercado
        ELSE p.valor_referencia
      END
    ) * COALESCE(p.porcentaje_propiedad, 100) / 100.0
  , 2) AS owner_share_value,
  CASE
    WHEN p.estado = 'alquilado'
      THEN ROUND(COALESCE(p.alquiler_mensual, 0) * COALESCE(p.porcentaje_propiedad, 100) / 100.0, 2)
    ELSE 0
  END AS monthly_contracted_rent,
  (p.estado = 'alquilado') AS occupied
FROM public.propiedades p
WHERE p.propietario_nombre IS NULL;

CREATE OR REPLACE VIEW public.v_patrimonio_cashflow AS
SELECT
  t.propiedad_id,
  ROUND(SUM(
    CASE WHEN t.tipo = 'ingreso' THEN
      t.importe * CASE WHEN COALESCE(t.solo_mio, false) THEN 1
                       ELSE COALESCE(p.porcentaje_propiedad, 100) / 100.0 END
    ELSE 0 END
  ), 2) AS ttm_income,
  ROUND(SUM(
    CASE WHEN t.tipo = 'gasto' THEN
      t.importe * CASE WHEN COALESCE(t.solo_mio, false) THEN 1
                       ELSE COALESCE(p.porcentaje_propiedad, 100) / 100.0 END
    ELSE 0 END
  ), 2) AS ttm_expenses,
  ROUND(SUM(
    CASE WHEN t.tipo = 'ingreso' AND t.categoria = 'Alquiler mensual' THEN
      t.importe * CASE WHEN COALESCE(t.solo_mio, false) THEN 1
                       ELSE COALESCE(p.porcentaje_propiedad, 100) / 100.0 END
    ELSE 0 END
  ), 2) AS ttm_collected_rent
FROM public.transacciones t
JOIN public.propiedades p ON p.id = t.propiedad_id
WHERE p.propietario_nombre IS NULL
  AND t.fecha >= (CURRENT_DATE - INTERVAL '12 months')
GROUP BY t.propiedad_id;

CREATE OR REPLACE FUNCTION public.patrimonio_macro_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH props AS (
  SELECT * FROM public.v_patrimonio_propiedades
),
cf AS (
  SELECT * FROM public.v_patrimonio_cashflow
),
rental AS (
  SELECT * FROM props
  WHERE estado NOT IN ('uso_propio', 'vivienda_habitual')
)
SELECT jsonb_build_object(
  'source', 'finca',
  'asOf', to_jsonb(now()),
  'currency', 'EUR',
  'scope', 'owner_share_only',
  'gaps', jsonb_build_array(
    'no_mortgage_principal',
    'valor_mercado_optional',
    'equity_equals_gross_until_debt_modeled'
  ),
  'totals', jsonb_build_object(
    'propertyCount', (SELECT count(*) FROM props),
    'grossMarketValue', (SELECT COALESCE(sum(owner_share_value), 0) FROM props),
    'cadastralValue', (SELECT COALESCE(sum(
      ROUND(COALESCE(valor_referencia, 0) * ownership_pct / 100.0, 2)
    ), 0) FROM props),
    'valueCoverage', jsonb_build_object(
      'withMarket', (SELECT count(*) FROM props WHERE value_source = 'mercado'),
      'withCadastralOnly', (SELECT count(*) FROM props WHERE value_source = 'catastro'),
      'missing', (SELECT count(*) FROM props WHERE value_source IS NULL)
    ),
    'mortgageOutstanding', NULL,
    'equity', (SELECT COALESCE(sum(owner_share_value), 0) FROM props),
    'monthlyContractedRent', (SELECT COALESCE(sum(monthly_contracted_rent), 0) FROM props),
    'ttmCollectedRent', (SELECT COALESCE(sum(ttm_collected_rent), 0) FROM cf),
    'ttmOperatingExpenses', (SELECT COALESCE(sum(ttm_expenses), 0) FROM cf),
    'ttmNetCashflow', (SELECT COALESCE(sum(COALESCE(ttm_income, 0) - COALESCE(ttm_expenses, 0)), 0) FROM cf),
    'occupancy', jsonb_build_object(
      'rented', (SELECT count(*) FROM rental WHERE estado = 'alquilado'),
      'vacant', (SELECT count(*) FROM rental WHERE estado = 'vacio'),
      'renovation', (SELECT count(*) FROM rental WHERE estado = 'reforma'),
      'forSale', (SELECT count(*) FROM rental WHERE estado = 'venta'),
      'ownerUse', (SELECT count(*) FROM props WHERE estado IN ('uso_propio', 'vivienda_habitual')),
      'rate', CASE
        WHEN (SELECT count(*) FROM rental WHERE estado IN ('alquilado', 'vacio', 'reforma')) = 0 THEN NULL
        ELSE ROUND(
          (SELECT count(*) FROM rental WHERE estado = 'alquilado')::numeric
          / NULLIF((SELECT count(*) FROM rental WHERE estado IN ('alquilado', 'vacio', 'reforma')), 0)
        , 4)
      END
    )
  ),
  'properties', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.nombre,
      'type', p.tipo,
      'status', p.estado,
      'municipio', p.municipio,
      'ownershipPct', p.ownership_pct,
      'grossValue', p.gross_value,
      'valueSource', p.value_source,
      'ownerShareValue', p.owner_share_value,
      'monthlyContractedRent', p.monthly_contracted_rent,
      'occupied', p.occupied,
      'ttmNetCashflow', COALESCE(c.ttm_income, 0) - COALESCE(c.ttm_expenses, 0)
    ) ORDER BY p.nombre), '[]'::jsonb)
    FROM props p
    LEFT JOIN cf c ON c.propiedad_id = p.id
  )
);
$$;

REVOKE ALL ON TABLE public.v_patrimonio_propiedades FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.v_patrimonio_cashflow FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.patrimonio_macro_snapshot() FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_patrimonio_propiedades TO postgres;
GRANT SELECT ON TABLE public.v_patrimonio_cashflow TO postgres;
GRANT EXECUTE ON FUNCTION public.patrimonio_macro_snapshot() TO postgres;
