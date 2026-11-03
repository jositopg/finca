-- Ficha de escritura: adquisición, cuota y bienes sin renta.
-- Cuota por defecto ausente = 1. No borra datos ya guardados.

alter table propiedades add column if not exists valor_adquisicion numeric;
alter table propiedades add column if not exists fecha_adquisicion date;
alter table propiedades add column if not exists tipo_adquisicion text;
alter table propiedades add column if not exists metros_cuadrados numeric;
alter table propiedades add column if not exists fecha_valor_mercado date;
alter table propiedades add column if not exists cuota_numerador integer;
alter table propiedades add column if not exists cuota_denominador integer;
alter table propiedades add column if not exists cuota_valor numeric;
alter table propiedades add column if not exists sin_renta boolean;
alter table propiedades add column if not exists financiacion jsonb;
alter table propiedades add column if not exists copropietarios jsonb;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'propiedades_tipo_adquisicion_check'
  ) then
    alter table propiedades add constraint propiedades_tipo_adquisicion_check
      check (tipo_adquisicion is null or tipo_adquisicion in ('herencia', 'donacion', 'compra'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'propiedades_cuota_check'
  ) then
    alter table propiedades add constraint propiedades_cuota_check
      check (
        (cuota_numerador is null and cuota_denominador is null and cuota_valor is null)
        or (
          cuota_numerador > 0
          and cuota_denominador > 0
          and cuota_numerador <= cuota_denominador
          and cuota_valor > 0
          and cuota_valor <= 1
        )
      );
  end if;
end $$;
