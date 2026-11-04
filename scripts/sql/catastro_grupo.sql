-- Valor catastral total, año de revisión y grupo. El suelo no es columna:
-- sale de valor_catastral − valor_construccion. Una referencia catastral
-- sigue siendo un inmueble (no hay lista de referencias).

alter table propiedades add column if not exists valor_catastral numeric;
alter table propiedades add column if not exists anio_revision_catastral integer;
alter table propiedades add column if not exists grupo text;
