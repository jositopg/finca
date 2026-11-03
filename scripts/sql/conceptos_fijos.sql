-- Importes fijos que el inquilino paga cada mes además de la renta
-- (p.ej. tasa de basuras). No son rendimiento del alquiler.
alter table propiedades add column if not exists conceptos_fijos jsonb;
