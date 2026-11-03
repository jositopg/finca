import { randomUUID, timingSafeEqual } from "node:crypto";
import { Client, types } from "pg";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
//#region src/types/importe.ts
function parseImporte(raw) {
	const s = raw.trim().replace(/€/g, "").trim();
	if (!s) return NaN;
	if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
	const puntos = s.split(".").length - 1;
	if (puntos === 1) {
		if (s.split(".")[1].length === 3) return Number(s.replace(".", ""));
		return Number(s);
	}
	if (puntos > 1) return Number(s.replace(/\./g, ""));
	return Number(s);
}
//#endregion
//#region src/types/ficha.ts
var FichaError = class extends Error {};
var LISTA = /* @__PURE__ */ new Set([
	"referenciaCatastral",
	"valorAdquisicion",
	"fechaAdquisicion",
	"tipoAdquisicion",
	"metrosCuadrados",
	"valorMercado",
	"fechaValorMercado",
	"valorReferencia",
	"valorConstruccion",
	"cuotaPropiedad",
	"sinRenta",
	"financiacion",
	"copropietarios"
]);
var TIPOS_ADQUISICION = /* @__PURE__ */ new Set([
	"herencia",
	"donacion",
	"compra"
]);
var ALFABETO = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789";
var PESOS_DC = [
	13,
	15,
	12,
	5,
	4,
	17,
	9,
	21,
	3,
	7,
	1
];
var LETRAS_DC = "MQWERTYUIOPASDFGHJKLBZX";
var CUOTA_ENTERA = {
	numerador: 1,
	denominador: 1,
	valor: 1
};
function fechaDeHoy(hoy = /* @__PURE__ */ new Date()) {
	const mes = String(hoy.getMonth() + 1).padStart(2, "0");
	const dia = String(hoy.getDate()).padStart(2, "0");
	return `${hoy.getFullYear()}-${mes}-${dia}`;
}
function normalizarReferenciaCatastral(raw) {
	return raw.replace(/[\s-]/g, "").toUpperCase();
}
function digitoControl(trozo) {
	let suma = 0;
	for (let i = 0; i < trozo.length; i++) {
		const c = trozo[i];
		const valor = c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : ALFABETO.indexOf(c) + 1;
		suma += PESOS_DC[i] * valor;
	}
	return LETRAS_DC[suma % 23];
}
function validarReferenciaCatastral(raw) {
	const ref = normalizarReferenciaCatastral(raw);
	if (ref.length !== 20) throw new FichaError("La referencia catastral tiene que tener 20 caracteres.");
	if (![...ref].every((c) => ALFABETO.includes(c))) throw new FichaError("La referencia catastral solo admite letras y números.");
	if (digitoControl(ref.slice(0, 7) + ref.slice(14, 18)) + digitoControl(ref.slice(7, 14) + ref.slice(14, 18)) !== ref.slice(18)) throw new FichaError("La referencia catastral no cuadra: los dígitos de control no son válidos.");
	return ref;
}
function gcd(a, b) {
	let x = Math.abs(a);
	let y = Math.abs(b);
	while (y) {
		const t = y;
		y = x % y;
		x = t;
	}
	return x || 1;
}
function reducir(numerador, denominador) {
	if (!Number.isInteger(numerador) || !Number.isInteger(denominador)) throw new FichaError("La cuota tiene que ser una fracción de enteros, como 1/12.");
	if (denominador === 0) throw new FichaError("La cuota no puede tener denominador 0.");
	if (denominador < 0) {
		numerador = -numerador;
		denominador = -denominador;
	}
	if (numerador <= 0 || numerador > denominador) throw new FichaError("La cuota tiene que ser mayor que 0 y como máximo 1.");
	const g = gcd(numerador, denominador);
	numerador /= g;
	denominador /= g;
	return {
		numerador,
		denominador,
		valor: Number((numerador / denominador).toFixed(6))
	};
}
function fraccionDeDecimal(valor) {
	let x = valor;
	let h0 = 0;
	let h1 = 1;
	let k0 = 1;
	let k1 = 0;
	for (let i = 0; i < 30; i++) {
		const a = Math.floor(x + 1e-12);
		const h2 = a * h1 + h0;
		const k2 = a * k1 + k0;
		if (k2 > 1e5) break;
		h0 = h1;
		h1 = h2;
		k0 = k1;
		k1 = k2;
		const resto = x - a;
		if (resto < 1e-10) break;
		x = 1 / resto;
	}
	return reducir(h1, k1);
}
function validarCuota(raw) {
	if (typeof raw === "number") {
		if (!Number.isFinite(raw) || raw <= 0 || raw > 1) throw new FichaError("La cuota tiene que ser mayor que 0 y como máximo 1.");
		return fraccionDeDecimal(raw);
	}
	if (typeof raw !== "string") throw new FichaError("La cuota tiene que ser un número o una fracción como 1/12.");
	const texto = raw.trim().replace(",", ".");
	const fraccion = /^(\d+)\s*\/\s*(\d+)$/.exec(texto);
	if (fraccion) return reducir(Number(fraccion[1]), Number(fraccion[2]));
	const n = Number(texto);
	if (!Number.isFinite(n) || n <= 0 || n > 1) throw new FichaError("La cuota tiene que ser mayor que 0 y como máximo 1.");
	return fraccionDeDecimal(n);
}
function cuotaEfectiva(cuota) {
	return cuota ?? CUOTA_ENTERA;
}
function parteDeCuota(total, cuota) {
	return Math.round(total * cuota.numerador * 100 / cuota.denominador) / 100;
}
function valorDe(total, cuota) {
	if (total == null || !Number.isFinite(total)) return {
		total: null,
		parteJose: null
	};
	const redondo = Math.round(total * 100) / 100;
	return {
		total: redondo,
		parteJose: parteDeCuota(redondo, cuota)
	};
}
function valoresProporcionales(p) {
	const cuota = cuotaEfectiva(p.cuotaPropiedad);
	return {
		cuota,
		mercado: valorDe(p.valorMercado, cuota),
		referencia: valorDe(p.valorReferencia, cuota),
		construccion: valorDe(p.valorConstruccion, cuota),
		adquisicion: valorDe(p.valorAdquisicion, cuota)
	};
}
function validarFecha(raw, campo) {
	if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new FichaError(`"${campo}" tiene que ser YYYY-MM-DD.`);
	const [anio, mes, dia] = raw.split("-").map(Number);
	const comprobada = new Date(Date.UTC(anio, mes - 1, dia));
	if (comprobada.getUTCFullYear() !== anio || comprobada.getUTCMonth() !== mes - 1 || comprobada.getUTCDate() !== dia) throw new FichaError(`"${campo}" no existe.`);
	return raw;
}
function validarFechaNoFutura(raw, campo, hoy) {
	const fecha = validarFecha(raw, campo);
	if (fecha > hoy) throw new FichaError(`"${campo}" no puede ser futura.`);
	return fecha;
}
function validarImporte(raw, campo, permitirCero = false) {
	const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseImporte(raw) : NaN;
	if (!Number.isFinite(n)) throw new FichaError(`"${campo}" tiene que ser un importe.`);
	const redondo = Math.round(n * 100) / 100;
	if (redondo < 0) throw new FichaError(`"${campo}" no puede ser negativo.`);
	if (!permitirCero && redondo === 0) throw new FichaError(`"${campo}" tiene que ser mayor que cero.`);
	return redondo;
}
function validarTipoAdquisicion(raw) {
	if (typeof raw !== "string" || !TIPOS_ADQUISICION.has(raw)) throw new FichaError("\"tipoAdquisicion\" tiene que ser herencia, donacion o compra.");
	return raw;
}
function validarBandera(raw, campo) {
	if (raw === true || raw === "true") return true;
	if (raw === false || raw === "false") return false;
	throw new FichaError(`"${campo}" tiene que ser true o false.`);
}
function validarFinanciacion(raw) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FichaError("\"financiacion\" tiene que ser un objeto.");
	const datos = raw;
	const permitidas = /* @__PURE__ */ new Set([
		"capitalPendiente",
		"cuotaMensual",
		"tipoInteres",
		"fechaFin"
	]);
	for (const clave of Object.keys(datos)) if (!permitidas.has(clave)) throw new FichaError(`"${clave}" no es un dato de la financiación.`);
	const out = {};
	if (datos.capitalPendiente != null && datos.capitalPendiente !== "") out.capitalPendiente = validarImporte(datos.capitalPendiente, "capitalPendiente", true);
	if (datos.cuotaMensual != null && datos.cuotaMensual !== "") out.cuotaMensual = validarImporte(datos.cuotaMensual, "cuotaMensual", true);
	if (datos.tipoInteres != null && datos.tipoInteres !== "") {
		const n = typeof datos.tipoInteres === "number" ? datos.tipoInteres : Number(datos.tipoInteres);
		if (!Number.isFinite(n) || n < 0 || n > 100) throw new FichaError("\"tipoInteres\" tiene que estar entre 0 y 100.");
		out.tipoInteres = Math.round(n * 1e4) / 1e4;
	}
	if (datos.fechaFin != null && datos.fechaFin !== "") out.fechaFin = validarFecha(datos.fechaFin, "fechaFin");
	if (Object.keys(out).length === 0) throw new FichaError("\"financiacion\" no trae ningún dato.");
	return out;
}
function validarCopropietarios(raw) {
	if (!Array.isArray(raw)) throw new FichaError("\"copropietarios\" tiene que ser una lista.");
	if (raw.length === 0) return [];
	const lista = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new FichaError("Cada copropietario tiene que tener nombre y porcentaje.");
		const fila = item;
		for (const clave of Object.keys(fila)) if (clave !== "nombre" && clave !== "porcentaje") throw new FichaError("\"copropietarios\" solo admite nombre y porcentaje.");
		if (typeof fila.nombre !== "string" || !fila.nombre.trim()) throw new FichaError("Cada copropietario tiene que tener nombre.");
		const porcentaje = validarImporte(fila.porcentaje, "porcentaje", false);
		if (porcentaje > 100) throw new FichaError("El porcentaje de un copropietario no puede pasar de 100.");
		lista.push({
			nombre: fila.nombre.trim(),
			porcentaje
		});
	}
	const suma = Math.round(lista.reduce((s, c) => s + c.porcentaje, 0) * 100) / 100;
	if (Math.abs(suma - 100) > .01) throw new FichaError("Los porcentajes de los copropietarios tienen que sumar 100.");
	return lista;
}
function asignar(parche, clave, valor) {
	parche[clave] = valor;
}
function interpretarCamposFicha(entrada, hoy) {
	if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new FichaError("\"campos\" tiene que ser un objeto.");
	const datos = entrada;
	const claves = Object.keys(datos);
	if (claves.length === 0) throw new FichaError("No hay ningún campo que guardar.");
	for (const clave of claves) {
		if (clave === "valorDeclaradoHerencia") throw new FichaError("\"valorDeclaradoHerencia\" no es un campo. Usa valorAdquisicion.");
		if (!LISTA.has(clave)) throw new FichaError(`"${clave}" no es un campo de la ficha.`);
	}
	const parche = {};
	const leer = (clave, convertir) => {
		if (!(clave in datos)) return;
		const valor = datos[clave];
		asignar(parche, clave, valor == null ? null : convertir(valor));
	};
	leer("referenciaCatastral", (valor) => {
		if (typeof valor !== "string") throw new FichaError("\"referenciaCatastral\" tiene que ser texto.");
		return validarReferenciaCatastral(valor);
	});
	leer("valorAdquisicion", (valor) => validarImporte(valor, "valorAdquisicion"));
	leer("fechaAdquisicion", (valor) => validarFechaNoFutura(valor, "fechaAdquisicion", hoy));
	leer("tipoAdquisicion", (valor) => validarTipoAdquisicion(valor));
	leer("metrosCuadrados", (valor) => validarImporte(valor, "metrosCuadrados"));
	leer("valorMercado", (valor) => validarImporte(valor, "valorMercado"));
	leer("fechaValorMercado", (valor) => validarFechaNoFutura(valor, "fechaValorMercado", hoy));
	leer("valorReferencia", (valor) => validarImporte(valor, "valorReferencia"));
	leer("valorConstruccion", (valor) => validarImporte(valor, "valorConstruccion"));
	leer("cuotaPropiedad", (valor) => validarCuota(valor));
	leer("sinRenta", (valor) => validarBandera(valor, "sinRenta"));
	leer("financiacion", (valor) => validarFinanciacion(valor));
	leer("copropietarios", (valor) => validarCopropietarios(valor));
	return parche;
}
function fusionarFicha(actual, parche) {
	const siguiente = { ...actual };
	for (const clave of Object.keys(parche)) {
		const valor = parche[clave];
		if (valor == null) delete siguiente[clave];
		else siguiente[clave] = valor;
	}
	return siguiente;
}
function cambiosDeFicha(actual, parche) {
	return Object.keys(parche).map((campo) => ({
		campo,
		antes: actual[campo] ?? null,
		despues: parche[campo] ?? null
	}));
}
//#endregion
//#region src/types/index.ts
function esDeJose(propiedad) {
	return !propiedad.propietarioNombre;
}
function esDeAlquiler(propiedad) {
	return propiedad.estado !== "uso_propio" && propiedad.estado !== "vivienda_habitual";
}
function esRendimientoAlquiler(propiedad) {
	return esDeAlquiler(propiedad) && !propiedad.sinRenta;
}
function amortizacionAnual(propiedad, anio) {
	if (!propiedad.valorConstruccion || propiedad.sinRenta) return 0;
	const anual = miParte(parteDeCuota(propiedad.valorConstruccion, cuotaEfectiva(propiedad.cuotaPropiedad)), propiedad) * (3 / 100);
	if (!anio) return anual;
	const meses = mesesAlquiladosEnAnio(propiedad, anio);
	return Math.round(anual * (meses / 12) * 100) / 100;
}
function mesesAlquiladosEnAnio(propiedad, anio) {
	const meses = mesesOcupados(propiedad, `${anio}-01-01`, `${anio}-12-31`);
	if (meses.length > 0) return meses.length;
	if (propiedad.estado === "alquilado") return 12;
	return 0;
}
function ultimosNMeses(hoy, n) {
	const meses = [];
	let y = hoy.getFullYear();
	let m = hoy.getMonth() + 1;
	for (let i = 0; i < n; i++) {
		meses.unshift(`${y}-${String(m).padStart(2, "0")}`);
		m--;
		if (m < 1) {
			m = 12;
			y--;
		}
	}
	return meses;
}
function rangoUltimosMeses(hoy, n = 12) {
	const meses = ultimosNMeses(hoy, n);
	const [desde] = rangoMes(meses[0]);
	const [, hasta] = rangoMes(meses[meses.length - 1]);
	return {
		desde,
		hasta
	};
}
function mesesEntre(desdeYYYYMM, hastaYYYYMM) {
	const meses = [];
	let [y, m] = desdeYYYYMM.split("-").map(Number);
	const [yHasta, mHasta] = hastaYYYYMM.split("-").map(Number);
	while (y < yHasta || y === yHasta && m <= mHasta) {
		meses.push(`${y}-${String(m).padStart(2, "0")}`);
		m++;
		if (m > 12) {
			m = 1;
			y++;
		}
	}
	return meses;
}
function periodosDeAlquiler(propiedad, hastaTope) {
	const periodos = [];
	for (const h of propiedad.historialContratos ?? []) periodos.push({
		ini: h.fechaInicio ?? h.fechaFin,
		fin: h.fechaFin
	});
	if (propiedad.contratoInicio) {
		let fin = propiedad.contratoFin ?? hastaTope;
		if (propiedad.estado === "alquilado" && (!propiedad.contratoFin || propiedad.contratoFin < hastaTope)) fin = hastaTope;
		periodos.push({
			ini: propiedad.contratoInicio,
			fin
		});
	}
	return periodos;
}
function clipPeriodo(ini, fin, desde, hasta) {
	const a = ini > desde ? ini : desde;
	const b = fin < hasta ? fin : hasta;
	if (a > b) return null;
	return {
		ini: a,
		fin: b
	};
}
function fusionarIntervalos(intervalos) {
	const orden = [...intervalos].sort((a, b) => a.ini.localeCompare(b.ini) || a.fin.localeCompare(b.fin));
	const out = [];
	for (const intervalo of orden) {
		const ultimo = out[out.length - 1];
		if (!ultimo || intervalo.ini > ultimo.fin) out.push({
			ini: intervalo.ini,
			fin: intervalo.fin
		});
		else if (intervalo.fin > ultimo.fin) ultimo.fin = intervalo.fin;
	}
	return out;
}
function mesesOcupados(propiedad, desde, hasta) {
	const meses = /* @__PURE__ */ new Set();
	for (const per of periodosDeAlquiler(propiedad, hasta)) {
		const clip = clipPeriodo(per.ini, per.fin, desde, hasta);
		if (!clip) continue;
		for (const m of mesesEntre(clip.ini.slice(0, 7), clip.fin.slice(0, 7))) meses.add(m);
	}
	return [...meses].sort();
}
function diasDelAnio(anio) {
	const y = Number(anio);
	return y % 4 === 0 && y % 100 !== 0 || y % 400 === 0 ? 366 : 365;
}
function diasAlquiladosEnAnio(propiedad, anio) {
	const desde = `${anio}-01-01`;
	const hasta = `${anio}-12-31`;
	const fusion = fusionarIntervalos(periodosDeAlquiler(propiedad, hasta).map((per) => clipPeriodo(per.ini, per.fin, desde, hasta)).filter((clip) => clip != null));
	if (fusion.length === 0 && propiedad.estado === "alquilado" && !hayFechasDeContrato(propiedad)) return diasDelAnio(anio);
	return fusion.reduce((s, i) => s + diasEntreFechas(i.ini, i.fin) + 1, 0);
}
function mesYaEmpezado(mes, hoy) {
	const [y, m] = mes.split("-").map(Number);
	return y < hoy.getFullYear() || y === hoy.getFullYear() && m <= hoy.getMonth() + 1;
}
function hayFechasDeContrato(propiedad) {
	if (propiedad.contratoInicio) return true;
	return (propiedad.historialContratos ?? []).some((h) => h.fechaInicio || h.fechaFin);
}
function mesesVaciosEnRango(propiedad, desde, hasta, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.sinRenta) return [];
	const ventana = mesesEntre(desde.slice(0, 7), hasta.slice(0, 7)).filter((mes) => mesYaEmpezado(mes, hoy));
	const ocupados = new Set(mesesOcupados(propiedad, desde, hasta));
	if (ocupados.size === 0 && propiedad.estado === "alquilado" && !hayFechasDeContrato(propiedad)) return [];
	return ventana.filter((mes) => !ocupados.has(mes));
}
function miParte(importe, propiedad, soloMio) {
	if (soloMio) return importe;
	return importe * ((propiedad.porcentajePropiedad ?? 100) / 100);
}
function fechaISO(hoy = /* @__PURE__ */ new Date()) {
	return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}
var TRAMO_INICIAL_ID = "tramo-inicial";
function tramosEfectivos(propiedad) {
	if (propiedad.tramosContrato && propiedad.tramosContrato.length > 0) return [...propiedad.tramosContrato].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
	if (!propiedad.contratoInicio) return [];
	return [{
		id: TRAMO_INICIAL_ID,
		vigenteDesde: propiedad.contratoInicio,
		alquilerMensual: propiedad.alquilerMensual,
		contratoFin: propiedad.contratoFin,
		fianzaImporte: propiedad.fianzaImporte
	}];
}
function tramoEnFecha(propiedad, fecha) {
	const tramos = tramosEfectivos(propiedad);
	let vigente;
	for (const t of tramos) if (t.vigenteDesde <= fecha) vigente = t;
	else break;
	return vigente;
}
function alquilerVigente(propiedad, fecha, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.sinRenta) return void 0;
	const dia = fecha ?? fechaISO(hoy);
	if (propiedad.contratoInicio && dia >= propiedad.contratoInicio) {
		const tramo = tramoEnFecha(propiedad, dia);
		if (tramo?.alquilerMensual != null) return tramo.alquilerMensual;
		return propiedad.alquilerMensual;
	}
	const historico = (propiedad.historialContratos ?? []).filter((c) => mismoInquilino(c, propiedad) && historicoCubre(c, dia)).sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))[0];
	if (historico) return alquilerDeHistorico(historico, dia);
	if (!propiedad.contratoInicio && !propiedad.tramosContrato?.length) return propiedad.alquilerMensual;
}
function snapshotTramo(anterior, cambio) {
	return {
		id: crypto.randomUUID(),
		vigenteDesde: cambio.vigenteDesde,
		alquilerMensual: cambio.alquilerMensual ?? anterior?.alquilerMensual,
		contratoFin: cambio.contratoFin ?? anterior?.contratoFin,
		fianzaImporte: cambio.fianzaImporte ?? anterior?.fianzaImporte,
		notas: cambio.notas?.trim() ? cambio.notas.trim() : void 0
	};
}
function hayCambioRespecto(anterior, nuevo) {
	if (!anterior) return true;
	return anterior.alquilerMensual !== nuevo.alquilerMensual || anterior.contratoFin !== nuevo.contratoFin || anterior.fianzaImporte !== nuevo.fianzaImporte || (nuevo.notas ?? "") !== (anterior.notas ?? "");
}
function sincronizarCamposVigentes(propiedad, hoy = /* @__PURE__ */ new Date()) {
	const tramos = tramosEfectivos(propiedad);
	if (tramos.length === 0) return propiedad;
	const vigente = tramoEnFecha(propiedad, fechaISO(hoy)) ?? tramos[0];
	const ultimo = tramos[tramos.length - 1];
	return {
		...propiedad,
		alquilerMensual: vigente.alquilerMensual,
		contratoFin: ultimo.contratoFin,
		fianzaImporte: vigente.fianzaImporte
	};
}
function aplicarCambioCondiciones(propiedad, cambio, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.estado !== "alquilado") return {
		ok: false,
		error: "Solo se pueden cambiar las condiciones de un contrato en vigor"
	};
	if (!propiedad.contratoInicio) return {
		ok: false,
		error: "Falta la fecha de inicio del contrato"
	};
	if (!cambio.vigenteDesde) return {
		ok: false,
		error: "Indica desde qué fecha aplican las nuevas condiciones"
	};
	if (cambio.vigenteDesde < propiedad.contratoInicio) return {
		ok: false,
		error: "La fecha no puede ser anterior al inicio del contrato"
	};
	const existentes = tramosEfectivos(propiedad).map((t) => t.id === TRAMO_INICIAL_ID ? {
		...t,
		id: crypto.randomUUID()
	} : t);
	const anterior = [...existentes].reverse().find((t) => t.vigenteDesde < cambio.vigenteDesde);
	const existenteMismoDia = existentes.find((t) => t.vigenteDesde === cambio.vigenteDesde);
	const nuevo = snapshotTramo(anterior ?? existenteMismoDia, cambio);
	if (!hayCambioRespecto(existenteMismoDia ?? anterior, nuevo)) return {
		ok: false,
		error: "No hay ningún cambio respecto a las condiciones anteriores"
	};
	const tramos = [...existentes.filter((t) => t.vigenteDesde !== cambio.vigenteDesde), nuevo].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
	const alquilerCambio = (anterior ?? existenteMismoDia)?.alquilerMensual !== nuevo.alquilerMensual;
	return {
		ok: true,
		propiedad: sincronizarCamposVigentes({
			...propiedad,
			tramosContrato: tramos,
			rentaRevisadaDesde: alquilerCambio ? hoy.toISOString() : propiedad.rentaRevisadaDesde
		}, hoy)
	};
}
function diaAnteriorISO(fecha) {
	const d = /* @__PURE__ */ new Date(`${fecha}T00:00:00`);
	d.setDate(d.getDate() - 1);
	return fechaISO(d);
}
function diaSiguienteISO(fecha) {
	const d = /* @__PURE__ */ new Date(`${fecha}T00:00:00`);
	d.setDate(d.getDate() + 1);
	return fechaISO(d);
}
function mismoInquilino(a, b) {
	const dniA = a.inquilinoDni?.trim().toUpperCase();
	const dniB = b.inquilinoDni?.trim().toUpperCase();
	if (dniA && dniB) return dniA === dniB;
	const nA = a.inquilinoNombre?.trim().toLowerCase();
	const nB = b.inquilinoNombre?.trim().toLowerCase();
	return !!nA && !!nB && nA === nB;
}
function historicoCubre(c, fecha) {
	if (fecha > c.fechaFin) return false;
	if (c.fechaInicio && fecha < c.fechaInicio) return false;
	return true;
}
function alquilerDeHistorico(c, fecha) {
	if (c.tramos && c.tramos.length > 0) {
		const sorted = [...c.tramos].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
		let vigente;
		for (const t of sorted) if (t.vigenteDesde <= fecha) vigente = t;
		if (vigente?.alquilerMensual != null) return vigente.alquilerMensual;
	}
	return c.alquilerMensual;
}
function inicioOcupacionActual(propiedad) {
	let inicio = propiedad.contratoInicio;
	const hist = [...propiedad.historialContratos ?? []].filter((c) => mismoInquilino(c, propiedad)).sort((a, b) => b.fechaFin.localeCompare(a.fechaFin));
	for (const c of hist) {
		if (!inicio) {
			inicio = c.fechaInicio;
			continue;
		}
		if (diaSiguienteISO(c.fechaFin) === inicio) inicio = c.fechaInicio ?? inicio;
		else break;
	}
	return inicio;
}
function interpretarNumeroFactura(valor) {
	const numero = valor.replace(/\s+/g, "").toUpperCase();
	if (!numero) return {};
	if (numero.length > 60) return { error: "El número de factura tiene que tener entre 1 y 60 caracteres." };
	return { numero };
}
function facturaYaRegistrada(transacciones, propiedadId, numero) {
	const clave = numero.replace(/\s+/g, "").toUpperCase();
	if (!clave) return false;
	return transacciones.some((t) => t.propiedadId === propiedadId && !!t.numeroFactura && t.numeroFactura.replace(/\s+/g, "").toUpperCase() === clave);
}
function diasEntreFechas(desde, hasta) {
	const d1 = /* @__PURE__ */ new Date(`${desde}T00:00:00`);
	const d2 = /* @__PURE__ */ new Date(`${hasta}T00:00:00`);
	return Math.round((d2.getTime() - d1.getTime()) / 864e5);
}
function importeEnRango(tx, desde, hasta) {
	if (!tx.periodoInicio || !tx.periodoFin) return tx.fecha >= desde && tx.fecha <= hasta ? tx.importe : 0;
	const inicioSolape = tx.periodoInicio > desde ? tx.periodoInicio : desde;
	const finSolape = tx.periodoFin < hasta ? tx.periodoFin : hasta;
	if (inicioSolape > finSolape) return 0;
	const diasSolape = diasEntreFechas(inicioSolape, finSolape) + 1;
	const diasTotales = diasEntreFechas(tx.periodoInicio, tx.periodoFin) + 1;
	return Math.round(tx.importe * (diasSolape / diasTotales) * 100) / 100;
}
function rangoAnio(anio) {
	return [`${anio}-01-01`, `${anio}-12-31`];
}
function rangoMes(mesYYYYMM) {
	const [y, m] = mesYYYYMM.split("-").map(Number);
	const ultimoDia = new Date(y, m, 0).getDate();
	return [`${mesYYYYMM}-01`, `${mesYYYYMM}-${String(ultimoDia).padStart(2, "0")}`];
}
function sumaConceptosFijos(propiedad) {
	return round2((propiedad.conceptosFijos ?? []).reduce((s, c) => s + c.importeMensual, 0));
}
function alquilerACobrar(propiedad, fecha, hoy = /* @__PURE__ */ new Date()) {
	const bruta = alquilerVigente(propiedad, fecha, hoy);
	if (bruta == null || bruta <= 0) return void 0;
	const total = round2((propiedad.tipo === "local" ? round2(calcularRentaLocal(bruta).neta) : bruta) + sumaConceptosFijos(propiedad));
	return total > 0 ? total : void 0;
}
function rentaPendiente(propiedad, transacciones, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.sinRenta || propiedad.estado !== "alquilado") return false;
	const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
	const esperado = alquilerACobrar(propiedad, `${mesActual}-01`, hoy);
	if (!esperado) return false;
	const diaAviso = propiedad.diaCobro && propiedad.diaCobro >= 1 && propiedad.diaCobro <= 28 ? propiedad.diaCobro : 5;
	if (hoy.getDate() < diaAviso) return false;
	return cobradoAlquilerEnMes(propiedad.id, transacciones, mesActual) + .005 < esperado;
}
function rentaDelMesIncompleta(propiedad, transacciones, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.sinRenta || propiedad.estado !== "alquilado") return false;
	const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
	const esperado = alquilerACobrar(propiedad, `${mesActual}-01`, hoy);
	if (!esperado) return false;
	return cobradoAlquilerEnMes(propiedad.id, transacciones, mesActual) + .005 < esperado;
}
function mesDelCobroAlquiler(t) {
	if (t.tipo === "ingreso" && t.categoria === "Alquiler mensual" && t.periodoInicio) return t.periodoInicio.slice(0, 7);
	return t.fecha.slice(0, 7);
}
function cobradoAlquilerEnMes(propiedadId, transacciones, mes) {
	return transacciones.filter((t) => t.propiedadId === propiedadId && t.tipo === "ingreso" && t.categoria === "Alquiler mensual" && mesDelCobroAlquiler(t) === mes).reduce((s, t) => s + t.importe, 0);
}
function rangoMesCivil(mes) {
	const y = Number(mes.slice(0, 4));
	const m = Number(mes.slice(5, 7));
	return {
		inicio: `${mes}-01`,
		fin: fechaISO(new Date(y, m, 0))
	};
}
function deudaInquilino(propiedad, transacciones, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.estado !== "alquilado") return null;
	const inicioOcupacion = inicioOcupacionActual(propiedad);
	if (!inicioOcupacion) return null;
	const mesAnteriorDate = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
	const mesLimite = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, "0")}`;
	const mesInicioContrato = inicioOcupacion.slice(0, 7);
	const mesInicio = propiedad.deudaDesde && propiedad.deudaDesde > mesInicioContrato ? propiedad.deudaDesde : mesInicioContrato;
	if (mesInicio > mesLimite) return null;
	const meses = mesesEntre(mesInicio, mesLimite);
	const cobros = transacciones.filter((t) => t.propiedadId === propiedad.id && t.tipo === "ingreso" && t.categoria === "Alquiler mensual");
	let esperado = 0;
	let hueco = 0;
	for (const mes of meses) {
		const due = alquilerACobrar(propiedad, `${mes}-01`, hoy) ?? 0;
		if (due <= 0) continue;
		esperado += due;
		const asignado = cobros.filter((t) => t.periodoInicio && mesDelCobroAlquiler(t) === mes).reduce((s, t) => s + t.importe, 0);
		hueco += Math.max(0, due - asignado);
	}
	if (esperado <= 0) return null;
	const libre = cobros.filter((t) => !t.periodoInicio && t.fecha.slice(0, 7) >= mesInicio).reduce((s, t) => s + t.importe, 0);
	const importe = Math.round((hueco - libre) * 100) / 100;
	if (importe <= 0) return null;
	const alquilerActual = alquilerACobrar(propiedad, fechaISO(hoy), hoy);
	return {
		importe,
		meses: importe / (alquilerActual && alquilerActual > 0 ? alquilerActual : importe)
	};
}
function contratoEstado(contratoFin, hoy = /* @__PURE__ */ new Date()) {
	if (!contratoFin) return null;
	const dias = diasEntreFechas(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`, contratoFin);
	return {
		dias,
		vencido: dias < 0,
		alerta: dias <= 60
	};
}
function tocaRevisarRenta(propiedad, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.estado !== "alquilado" || !propiedad.contratoInicio) return false;
	const inicio = /* @__PURE__ */ new Date(`${propiedad.contratoInicio}T00:00:00`);
	const desde = propiedad.rentaRevisadaDesde ? new Date(propiedad.rentaRevisadaDesde) : inicio;
	let aniversario = new Date(desde.getFullYear(), inicio.getMonth(), inicio.getDate());
	if (aniversario <= desde) aniversario = new Date(desde.getFullYear() + 1, inicio.getMonth(), inicio.getDate());
	return hoy >= aniversario;
}
var HUECO_MENSUAL_LABEL = {
	renta: "Renta",
	agua: "Agua",
	luz: "Luz"
};
var MESES_SEGUIMIENTO_HUECOS = 6;
function mesesSeguimientoAlquiler(propiedad, hoy = /* @__PURE__ */ new Date()) {
	const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
	const haceN = ultimosNMeses(hoy, MESES_SEGUIMIENTO_HUECOS)[0];
	const ocupacion = inicioOcupacionActual(propiedad)?.slice(0, 7);
	const desde = ocupacion && ocupacion > haceN ? ocupacion : haceN;
	if (desde > mesActual) return [];
	return mesesEntre(desde, mesActual);
}
function huecosMensuales(propiedad, transacciones, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.sinRenta || propiedad.estado !== "alquilado") return [];
	const omitidos = new Set((propiedad.huecosMensualesOmitidos ?? []).map((h) => `${h.tipo}:${h.mes}`));
	const txs = transacciones.filter((t) => t.propiedadId === propiedad.id);
	const huecos = [];
	for (const mes of mesesSeguimientoAlquiler(propiedad, hoy)) {
		const [desde, hasta] = rangoMes(mes);
		if (alquilerACobrar(propiedad, `${mes}-01`, hoy)) {
			if (cobradoAlquilerEnMes(propiedad.id, txs, mes) <= .005 && !omitidos.has(`renta:${mes}`)) huecos.push({
				tipo: "renta",
				mes
			});
		}
		if (!txs.some((t) => t.tipo === "gasto" && t.categoria === "Agua" && importeEnRango(t, desde, hasta) !== 0) && !omitidos.has(`agua:${mes}`)) huecos.push({
			tipo: "agua",
			mes
		});
		if (!txs.some((t) => t.tipo === "gasto" && t.categoria === "Electricidad" && importeEnRango(t, desde, hasta) !== 0) && !omitidos.has(`luz:${mes}`)) huecos.push({
			tipo: "luz",
			mes
		});
	}
	return huecos;
}
function avisosDePropiedad(propiedad, transacciones, hoy = /* @__PURE__ */ new Date()) {
	const avisos = [];
	const base = {
		propiedadId: propiedad.id,
		nombre: propiedad.nombre
	};
	const huecos = propiedad.sinRenta ? [] : huecosMensuales(propiedad, transacciones, hoy);
	if (huecos.length > 0) {
		const resumen = huecos.slice(0, 4).map((h) => `${HUECO_MENSUAL_LABEL[h.tipo].toLowerCase()} ${h.mes.slice(5, 7)}/${h.mes.slice(0, 4)}`).join(" · ");
		avisos.push({
			...base,
			tipo: "registro",
			mensaje: huecos.length > 4 ? `Falta ${resumen} y ${huecos.length - 4} más` : `Falta ${resumen}`
		});
	}
	const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
	if (!propiedad.sinRenta && rentaPendiente(propiedad, transacciones, hoy) && !huecos.some((h) => h.tipo === "renta" && h.mes === mesActual)) avisos.push({
		...base,
		tipo: "renta",
		mensaje: "Renta sin cobrar este mes"
	});
	if (!propiedad.sinRenta && propiedad.estado === "alquilado" && propiedad.fianzaImporte && !propiedad.fianzaDepositadaDesde) avisos.push({
		...base,
		tipo: "fianza",
		mensaje: "Fianza pendiente de depositar (ICAVI)"
	});
	const estadoC = contratoEstado(propiedad.contratoFin, hoy);
	if (!propiedad.sinRenta && propiedad.estado === "alquilado" && estadoC?.alerta) avisos.push({
		...base,
		tipo: "contrato",
		mensaje: estadoC.vencido ? "Contrato en tácita reconducción" : `Contrato vence en ${estadoC.dias} días`
	});
	if (!propiedad.sinRenta && tocaRevisarRenta(propiedad, hoy)) avisos.push({
		...base,
		tipo: "revision",
		mensaje: "Toca revisar la renta (IPC/IGC)"
	});
	const cee = contratoEstado(propiedad.certificadoEnergeticoVencimiento, hoy);
	if (cee?.alerta) avisos.push({
		...base,
		tipo: "cee",
		mensaje: cee.vencido ? "Certificado energético caducado" : `CEE vence en ${cee.dias} días`
	});
	const seguro = contratoEstado(propiedad.seguroVencimiento, hoy);
	if (seguro?.alerta) avisos.push({
		...base,
		tipo: "seguro",
		mensaje: seguro.vencido ? "Seguro caducado" : `Seguro vence en ${seguro.dias} días`
	});
	if (propiedad.ibiMes && hoy.getMonth() + 1 === propiedad.ibiMes && hoy.getDate() <= 20) avisos.push({
		...base,
		tipo: "ibi",
		mensaje: "Mes del IBI"
	});
	return avisos;
}
var INCLUSION_AGUA_LUZ_LABEL = {
	incluido: "Incluido",
	no_incluido: "No incluido",
	parcial_conjunto: "30 € juntos"
};
function esAguaOLuz(categoria) {
	return categoria === "Agua" || categoria === "Electricidad";
}
function repartoEfectivo(propiedad) {
	const r = { ...propiedad.reparto ?? {} };
	if (!r.basuras && (propiedad.gastosRecurrentes ?? []).some((g) => g.categoria === "Tasa de basuras")) r.basuras = { modo: "no_incluido" };
	return Object.keys(r).length > 0 ? r : void 0;
}
function esIngresoRepercutido(categoria) {
	return categoria === "Agua (repercutida)" || categoria === "Electricidad (repercutida)";
}
function round2(n) {
	return Math.round(n * 100) / 100;
}
function inclusionAguaLuz(reparto) {
	if (!reparto) return void 0;
	if (reparto.aguaLuz) return reparto.aguaLuz;
	const a = reparto.agua;
	const l = reparto.luz;
	if (!a && !l) return void 0;
	if (a && l && a.modo !== l.modo) return void 0;
	const uno = a ?? l;
	if (!uno) return void 0;
	if (uno.modo === "incluido" || uno.modo === "no_incluido") return { modo: uno.modo };
	if (uno.modo === "parcial_conjunto") return {
		modo: "parcial_conjunto",
		importeMensual: uno.importeIncluido
	};
	if (uno.modo === "parcial") {
		if (a && l && (a.importeIncluido ?? 0) !== (l.importeIncluido ?? 0)) return void 0;
		return {
			modo: "parcial_conjunto",
			importeMensual: uno.importeIncluido
		};
	}
}
var CONCEPTO_CATEGORIA = {
	agua: "Agua",
	luz: "Electricidad",
	basuras: "Tasa de basuras",
	ibi: "IBI"
};
function calcularReparto(categoria, importe, reparto) {
	if (!reparto) return null;
	const concepto = Object.keys(CONCEPTO_CATEGORIA).find((c) => CONCEPTO_CATEGORIA[c] === categoria);
	if (!concepto) return null;
	const config = reparto[concepto];
	if (!config) return null;
	if (config.modo === "incluido") return {
		concepto,
		modo: "incluido",
		propietario: importe,
		inquilino: 0
	};
	if (config.modo === "no_incluido") return {
		concepto,
		modo: "no_incluido",
		propietario: 0,
		inquilino: importe
	};
	const propietario = Math.min(config.importeIncluido ?? 0, importe);
	return {
		concepto,
		modo: "parcial",
		propietario,
		inquilino: round2(importe - propietario)
	};
}
function desgloseSuministrosEnRango(propiedad, transacciones, desde, hasta) {
	const suministros = transacciones.filter((t) => t.propiedadId === propiedad.id && t.tipo === "gasto" && esAguaOLuz(t.categoria));
	let facturado = 0;
	for (const t of suministros) facturado += importeEnRango(t, desde, hasta);
	facturado = round2(facturado);
	const inclusion = inclusionAguaLuz(propiedad.reparto);
	if (!inclusion) {
		let propietario = 0;
		let inquilino = 0;
		for (const t of suministros) {
			const enRango = importeEnRango(t, desde, hasta);
			if (enRango === 0) continue;
			const r = calcularReparto(t.categoria, t.importe, propiedad.reparto);
			if (!r) {
				propietario += enRango;
				continue;
			}
			const frac = t.importe !== 0 ? enRango / t.importe : 0;
			propietario += r.propietario * frac;
			inquilino += r.inquilino * frac;
		}
		return {
			facturado,
			propietario: round2(propietario),
			inquilino: round2(inquilino)
		};
	}
	if (inclusion.modo === "incluido") return {
		facturado,
		propietario: facturado,
		inquilino: 0
	};
	if (inclusion.modo === "no_incluido") return {
		facturado,
		propietario: 0,
		inquilino: facturado
	};
	const importeMensual = inclusion.importeMensual ?? 0;
	let propietario = 0;
	for (const mes of mesesEntre(desde.slice(0, 7), hasta.slice(0, 7))) {
		const [mesDesde, mesHasta] = rangoMes(mes);
		const sliceDesde = mesDesde > desde ? mesDesde : desde;
		const sliceHasta = mesHasta < hasta ? mesHasta : hasta;
		if (sliceDesde > sliceHasta) continue;
		let totalMes = 0;
		for (const t of suministros) totalMes += importeEnRango(t, sliceDesde, sliceHasta);
		const diasMes = diasEntreFechas(mesDesde, mesHasta) + 1;
		const cupo = round2(importeMensual * ((diasEntreFechas(sliceDesde, sliceHasta) + 1) / diasMes));
		propietario += Math.min(totalMes, cupo);
	}
	propietario = round2(propietario);
	return {
		facturado,
		propietario,
		inquilino: round2(Math.max(0, facturado - propietario))
	};
}
function txsDePropiedad(propiedad, transacciones) {
	return transacciones.filter((t) => t.propiedadId === propiedad.id);
}
function mesesCubiertosPorCobro(t) {
	if (t.periodoInicio && t.periodoFin && t.periodoInicio <= t.periodoFin) return mesesEntre(t.periodoInicio.slice(0, 7), t.periodoFin.slice(0, 7));
	return [t.fecha.slice(0, 7)];
}
function rentaCobrableSinConceptos(propiedad, fecha) {
	const bruta = alquilerVigente(propiedad, fecha);
	if (bruta == null || bruta <= 0) return void 0;
	if (propiedad.tipo === "local") return round2(calcularRentaLocal(bruta).neta);
	return bruta;
}
function alquilerEnRangoSinConceptos(t, propiedad, desde, hasta) {
	const enRango = importeEnRango(t, desde, hasta);
	if (t.tipo !== "ingreso" || t.categoria !== "Alquiler mensual" || enRango <= 0) return enRango;
	const mensual = sumaConceptosFijos(propiedad);
	if (mensual <= 0 || t.importe <= 0) return enRango;
	let pactada = 0;
	let cupo = 0;
	for (const mes of mesesCubiertosPorCobro(t)) {
		const renta = rentaCobrableSinConceptos(propiedad, `${mes}-01`);
		if (renta == null) continue;
		pactada = round2(pactada + renta);
		cupo = round2(cupo + mensual);
	}
	const repercutido = Math.min(cupo, round2(Math.max(0, t.importe - pactada)));
	if (repercutido <= 0) return enRango;
	return round2(Math.max(0, enRango - repercutido * (enRango / t.importe)));
}
function sumIngresosEnRango(propiedad, transacciones, desde, hasta, opts) {
	return txsDePropiedad(propiedad, transacciones).reduce((s, t) => {
		if (t.tipo !== "ingreso" || esIngresoRepercutido(t.categoria)) return s;
		if (opts?.irpf) return s + ingresoIrpfDeTx(t, propiedad, desde, hasta);
		return s + miParte(importeEnRango(t, desde, hasta), propiedad, t.soloMio);
	}, 0);
}
function sumRentasEnRango(propiedad, transacciones, desde, hasta) {
	return txsDePropiedad(propiedad, transacciones).reduce((s, t) => {
		if (t.tipo !== "ingreso" || !CATEGORIAS_RENDIMIENTO.includes(t.categoria)) return s;
		return s + miParte(t.categoria === "Alquiler mensual" ? alquilerEnRangoSinConceptos(t, propiedad, desde, hasta) : importeEnRango(t, desde, hasta), propiedad, t.soloMio);
	}, 0);
}
function cuotaOtrosEnRango(t, propiedad, desde, hasta) {
	const enRango = importeEnRango(t, desde, hasta);
	if (enRango === 0) return {
		propietario: 0,
		inquilino: 0
	};
	const r = calcularReparto(t.categoria, t.importe, repartoEfectivo(propiedad));
	if (!r) return {
		propietario: enRango,
		inquilino: 0
	};
	const frac = t.importe !== 0 ? enRango / t.importe : 0;
	return {
		propietario: r.propietario * frac,
		inquilino: r.inquilino * frac
	};
}
function sumGastosEnRango(propiedad, transacciones, desde, hasta, opts) {
	const txs = txsDePropiedad(propiedad, transacciones);
	const otros = txs.filter((t) => t.tipo === "gasto" && !esAguaOLuz(t.categoria) && (!opts?.irpf || esGastoDeducibleIRPF(t.categoria))).reduce((s, t) => s + miParte(cuotaOtrosEnRango(t, propiedad, desde, hasta).propietario, propiedad, t.soloMio), 0);
	const { propietario } = desgloseSuministrosEnRango(propiedad, txs, desde, hasta);
	return round2(otros + miParte(propietario, propiedad));
}
function resumenEnRango(propiedad, transacciones, desde, hasta) {
	const txs = txsDePropiedad(propiedad, transacciones);
	return {
		ingresos: sumIngresosEnRango(propiedad, txs, desde, hasta),
		gastos: sumGastosEnRango(propiedad, txs, desde, hasta),
		suministros: desgloseSuministrosEnRango(propiedad, txs, desde, hasta)
	};
}
function resumenVariasEnRango(propiedades, transacciones, desde, hasta) {
	let ingresos = 0;
	let gastos = 0;
	let inquilino = 0;
	for (const p of propiedades) {
		const r = resumenEnRango(p, transacciones, desde, hasta);
		ingresos += r.ingresos;
		gastos += r.gastos;
		inquilino += r.suministros.inquilino;
	}
	return {
		ingresos: round2(ingresos),
		gastos: round2(gastos),
		inquilino: round2(inquilino)
	};
}
function rentabilidadEnRango(propiedad, transacciones, desde, hasta, hoy = /* @__PURE__ */ new Date()) {
	if (propiedad.sinRenta) return {
		bruta: null,
		neta: null,
		rentas: 0,
		gastos: 0,
		valorMercado: null,
		mesesVacios: 0,
		motivo: "Sin renta."
	};
	const mesesVacios = mesesVaciosEnRango(propiedad, desde, hasta, hoy).length;
	const rentas = round2(sumRentasEnRango(propiedad, transacciones, desde, hasta));
	const gastos = sumGastosEnRango(propiedad, transacciones, desde, hasta);
	const bruto = propiedad.valorMercado;
	const valor = bruto != null && bruto > 0 ? round2(parteDeCuota(bruto, cuotaEfectiva(propiedad.cuotaPropiedad))) : 0;
	if (valor <= 0) return {
		bruta: null,
		neta: null,
		rentas,
		gastos,
		valorMercado: null,
		mesesVacios,
		motivo: "Sin valor de mercado."
	};
	return {
		bruta: rentas / valor * 100,
		neta: (rentas - gastos) / valor * 100,
		rentas,
		gastos,
		valorMercado: valor,
		mesesVacios
	};
}
function totalRentabilidad(filas) {
	const conValor = filas.filter((f) => f.valorMercado != null && f.valorMercado > 0 && f.bruta != null);
	const mesesVacios = filas.reduce((s, f) => s + f.mesesVacios, 0);
	const rentas = round2(conValor.reduce((s, f) => s + f.rentas, 0));
	const gastos = round2(conValor.reduce((s, f) => s + f.gastos, 0));
	const valor = round2(conValor.reduce((s, f) => s + (f.valorMercado ?? 0), 0));
	if (valor <= 0) return {
		bruta: null,
		neta: null,
		rentas: 0,
		gastos: 0,
		valorMercado: null,
		mesesVacios,
		motivo: "Sin valor de mercado."
	};
	return {
		bruta: rentas / valor * 100,
		neta: (rentas - gastos) / valor * 100,
		rentas,
		gastos,
		valorMercado: valor,
		mesesVacios
	};
}
function rentabilidadCartera(propiedades, transacciones, desde, hasta, hoy = /* @__PURE__ */ new Date()) {
	const porFinca = propiedades.filter((p) => esDeJose(p) && esRendimientoAlquiler(p)).map((p) => ({
		nombre: p.nombre,
		...rentabilidadEnRango(p, transacciones, desde, hasta, hoy)
	})).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
	return {
		desde,
		hasta,
		porFinca,
		total: totalRentabilidad(porFinca)
	};
}
function desgloseRepercutible(propiedad, transacciones, desde, hasta) {
	const txs = txsDePropiedad(propiedad, transacciones);
	const suministros = txs.filter((t) => t.tipo === "gasto" && esAguaOLuz(t.categoria));
	let agua = 0;
	let luz = 0;
	for (const mes of mesesEntre(desde.slice(0, 7), hasta.slice(0, 7))) {
		const [mesDesde, mesHasta] = rangoMes(mes);
		const sliceDesde = mesDesde > desde ? mesDesde : desde;
		const sliceHasta = mesHasta < hasta ? mesHasta : hasta;
		if (sliceDesde > sliceHasta) continue;
		const d = desgloseSuministrosEnRango(propiedad, txs, sliceDesde, sliceHasta);
		if (d.inquilino <= 0 || d.facturado <= 0) continue;
		let aguaMes = 0;
		let luzMes = 0;
		for (const t of suministros) {
			const n = importeEnRango(t, sliceDesde, sliceHasta);
			if (t.categoria === "Agua") aguaMes += n;
			else luzMes += n;
		}
		agua += d.inquilino * (aguaMes / d.facturado);
		luz += d.inquilino * (luzMes / d.facturado);
	}
	const porCategoria = {};
	if (agua > .005) porCategoria.Agua = round2(agua);
	if (luz > .005) porCategoria.Electricidad = round2(luz);
	for (const t of txs) {
		if (t.tipo !== "gasto" || esAguaOLuz(t.categoria)) continue;
		const { inquilino } = cuotaOtrosEnRango(t, propiedad, desde, hasta);
		if (inquilino <= .005) continue;
		porCategoria[t.categoria] = round2((porCategoria[t.categoria] ?? 0) + inquilino);
	}
	const total = round2(Object.values(porCategoria).reduce((s, n) => s + n, 0));
	return {
		agua: round2(agua),
		luz: round2(luz),
		porCategoria,
		total
	};
}
function contratoRepercuteSuministros(propiedad) {
	const r = repartoEfectivo(propiedad);
	const i = inclusionAguaLuz(r);
	if (i?.modo && i.modo !== "incluido") return true;
	if (r?.agua && r.agua.modo !== "incluido" || r?.luz && r.luz.modo !== "incluido") return true;
	if (r?.basuras && r.basuras.modo !== "incluido") return true;
	if (r?.ibi && r.ibi.modo !== "incluido") return true;
	return false;
}
function filasRepercutibles(propiedades, transacciones, desde, hasta) {
	return propiedades.map((propiedad) => ({
		propiedad,
		...desgloseRepercutible(propiedad, transacciones, desde, hasta)
	})).filter((f) => f.total > .005 || contratoRepercuteSuministros(f.propiedad)).sort((a, b) => b.total - a.total || a.propiedad.nombre.localeCompare(b.propiedad.nombre, "es"));
}
function desgloseSuministrosPorMes(propiedad, transacciones, desde, hasta) {
	const txs = txsDePropiedad(propiedad, transacciones);
	const suministros = txs.filter((t) => t.tipo === "gasto" && esAguaOLuz(t.categoria));
	const otros = txs.filter((t) => t.tipo === "gasto" && !esAguaOLuz(t.categoria));
	const meses = [];
	for (const mes of mesesEntre(desde.slice(0, 7), hasta.slice(0, 7))) {
		const [md, mh] = rangoMes(mes);
		const d = desgloseSuministrosEnRango(propiedad, txs, md, mh);
		const lineas = [];
		if (d.facturado > .005) for (const t of suministros) {
			const slice = importeEnRango(t, md, mh);
			if (slice <= .005) continue;
			const frac = d.facturado !== 0 ? slice / d.facturado : 0;
			const inquilino = round2(d.inquilino * frac);
			if (inquilino <= .005 && d.inquilino <= .005) continue;
			lineas.push({
				txId: t.id,
				categoria: t.categoria,
				facturadoMes: round2(slice),
				propietario: round2(d.propietario * frac),
				inquilino,
				fecha: t.fecha,
				periodoInicio: t.periodoInicio,
				periodoFin: t.periodoFin
			});
		}
		for (const t of otros) {
			const { propietario, inquilino } = cuotaOtrosEnRango(t, propiedad, md, mh);
			if (inquilino <= .005) continue;
			lineas.push({
				txId: t.id,
				categoria: t.categoria,
				facturadoMes: round2(importeEnRango(t, md, mh)),
				propietario: round2(propietario),
				inquilino: round2(inquilino),
				fecha: t.fecha,
				periodoInicio: t.periodoInicio,
				periodoFin: t.periodoFin
			});
		}
		if (lineas.length === 0) continue;
		lineas.sort((a, b) => a.categoria.localeCompare(b.categoria, "es") || a.fecha.localeCompare(b.fecha));
		const facturado = round2(lineas.reduce((s, l) => s + l.facturadoMes, 0));
		const propietario = round2(lineas.reduce((s, l) => s + l.propietario, 0));
		const inquilino = round2(lineas.reduce((s, l) => s + l.inquilino, 0));
		if (inquilino <= .005) continue;
		meses.push({
			mes,
			facturado,
			propietario,
			inquilino,
			lineas
		});
	}
	return meses.reverse();
}
function gastosPorCategoriaEnRango(propiedad, transacciones, desde, hasta) {
	const txs = txsDePropiedad(propiedad, transacciones);
	const acc = {};
	for (const t of txs) {
		if (t.tipo !== "gasto" || esAguaOLuz(t.categoria)) continue;
		const n = miParte(cuotaOtrosEnRango(t, propiedad, desde, hasta).propietario, propiedad, t.soloMio);
		if (n === 0) continue;
		acc[t.categoria] = (acc[t.categoria] ?? 0) + n;
	}
	const inclusion = inclusionAguaLuz(propiedad.reparto);
	const porConcepto = {
		Agua: 0,
		Electricidad: 0
	};
	if (!inclusion) for (const t of txs) {
		if (t.tipo !== "gasto" || !esAguaOLuz(t.categoria)) continue;
		const enRango = importeEnRango(t, desde, hasta);
		if (enRango === 0) continue;
		const r = calcularReparto(t.categoria, t.importe, propiedad.reparto);
		const bruto = r ? r.propietario * (t.importe !== 0 ? enRango / t.importe : 0) : enRango;
		porConcepto[t.categoria] = (porConcepto[t.categoria] ?? 0) + miParte(bruto, propiedad, t.soloMio);
	}
	else if (inclusion.modo === "incluido") for (const t of txs) {
		if (t.tipo !== "gasto" || !esAguaOLuz(t.categoria)) continue;
		porConcepto[t.categoria] += miParte(importeEnRango(t, desde, hasta), propiedad, t.soloMio);
	}
	else if (inclusion.modo === "parcial_conjunto") {
		const suministros = txs.filter((t) => t.tipo === "gasto" && esAguaOLuz(t.categoria));
		for (const mes of mesesEntre(desde.slice(0, 7), hasta.slice(0, 7))) {
			const [mesDesde, mesHasta] = rangoMes(mes);
			const sliceDesde = mesDesde > desde ? mesDesde : desde;
			const sliceHasta = mesHasta < hasta ? mesHasta : hasta;
			if (sliceDesde > sliceHasta) continue;
			const d = desgloseSuministrosEnRango(propiedad, txs, sliceDesde, sliceHasta);
			if (d.facturado <= 0 || d.propietario <= 0) continue;
			let agua = 0;
			let luz = 0;
			for (const t of suministros) {
				const n = importeEnRango(t, sliceDesde, sliceHasta);
				if (t.categoria === "Agua") agua += n;
				else luz += n;
			}
			porConcepto.Agua += d.propietario * (agua / d.facturado);
			porConcepto.Electricidad += d.propietario * (luz / d.facturado);
		}
		porConcepto.Agua = miParte(porConcepto.Agua, propiedad);
		porConcepto.Electricidad = miParte(porConcepto.Electricidad, propiedad);
	}
	for (const [cat, n] of Object.entries(porConcepto)) {
		const v = round2(n);
		if (v > 0) acc[cat] = (acc[cat] ?? 0) + v;
	}
	return acc;
}
function calcularRentaLocal(rentaBruta) {
	const igic = rentaBruta * (7 / 100);
	const irpf = rentaBruta * (19 / 100);
	return {
		base: rentaBruta,
		igic,
		irpf,
		neta: rentaBruta + igic - irpf
	};
}
function baseDesdeRentaNeta(rentaNeta) {
	return rentaNeta / (1.07 - 19 / 100);
}
function cubreContratoEnFicha(propiedad, fecha) {
	if (!propiedad.contratoInicio || fecha < propiedad.contratoInicio) return false;
	if (propiedad.estado === "alquilado") return true;
	return !!propiedad.contratoFin && fecha <= propiedad.contratoFin;
}
function historialCubreFecha(c, fecha) {
	if (fecha > c.fechaFin) return false;
	if (c.fechaInicio) return fecha >= c.fechaInicio;
	return fecha.slice(0, 4) === c.fechaFin.slice(0, 4);
}
function rentaPactadaEnFecha(propiedad, fecha) {
	if (propiedad.sinRenta) return void 0;
	if (cubreContratoEnFicha(propiedad, fecha)) {
		const renta = tramoEnFecha(propiedad, fecha)?.alquilerMensual ?? propiedad.alquilerMensual;
		if (renta != null && renta > 0) return renta;
	}
	const historico = (propiedad.historialContratos ?? []).filter((c) => historialCubreFecha(c, fecha)).sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))[0];
	if (historico) {
		const renta = alquilerDeHistorico(historico, fecha);
		if (renta != null && renta > 0) return renta;
	}
	if (propiedad.estado === "alquilado" && !propiedad.contratoInicio && !propiedad.tramosContrato?.length && !propiedad.historialContratos?.length && propiedad.alquilerMensual != null && propiedad.alquilerMensual > 0) return propiedad.alquilerMensual;
}
function rentaPactadaEnMes(propiedad, mes) {
	const { inicio, fin } = rangoMesCivil(mes);
	const alInicio = rentaPactadaEnFecha(propiedad, inicio);
	if (alInicio != null) return alInicio;
	const dias = [];
	if (propiedad.contratoInicio && propiedad.contratoInicio > inicio && propiedad.contratoInicio <= fin) dias.push(propiedad.contratoInicio);
	for (const h of propiedad.historialContratos ?? []) if (h.fechaInicio && h.fechaInicio > inicio && h.fechaInicio <= fin) dias.push(h.fechaInicio);
	dias.sort();
	for (const dia of dias) {
		const renta = rentaPactadaEnFecha(propiedad, dia);
		if (renta != null) return renta;
	}
}
function devengoIgicLocalTrimestre(propiedad, anio, trimestre, hoy = /* @__PURE__ */ new Date()) {
	if (trimestre < 1 || trimestre > 4) return {
		base: 0,
		igic: 0,
		meses: []
	};
	const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
	const primero = (trimestre - 1) * 3 + 1;
	const meses = [];
	for (let i = 0; i < 3; i++) {
		const mes = `${anio}-${String(primero + i).padStart(2, "0")}`;
		if (mes > mesHoy) continue;
		const pactada = rentaPactadaEnMes(propiedad, mes);
		if (pactada == null) continue;
		const base = round2(miParte(pactada, propiedad));
		if (base <= 0) continue;
		meses.push({
			mes,
			base,
			igic: round2(base * (7 / 100))
		});
	}
	return {
		base: round2(meses.reduce((s, m) => s + m.base, 0)),
		igic: round2(meses.reduce((s, m) => s + m.igic, 0)),
		meses
	};
}
var CATEGORIAS_GASTO = [
	"Electricidad",
	"Agua",
	"Gas",
	"Telefonía / Internet",
	"IBI",
	"Tasa de basuras",
	"IRPF / Retención",
	"Otros impuestos",
	"Comunidad de propietarios",
	"Seguro hogar",
	"Seguro impago",
	"Mantenimiento",
	"Reparaciones",
	"Hipoteca / Financiación",
	"Intereses hipoteca",
	"Honorarios / Gestión",
	"Mobiliario / Equipamiento",
	"Obras / Reforma",
	"Otros gastos"
];
var CATEGORIAS_GASTO_NO_DEDUCIBLE_IRPF = ["Hipoteca / Financiación"];
var CATEGORIAS_INGRESO = [
	"Alquiler mensual",
	"Electricidad (repercutida)",
	"Agua (repercutida)",
	"Fianza recibida",
	"Devolución de fianza",
	"Otros ingresos"
];
var TRAMOS_IRPF_APROX = [
	{
		hasta: 12450,
		tipo: 19
	},
	{
		hasta: 20200,
		tipo: 24
	},
	{
		hasta: 35200,
		tipo: 30
	},
	{
		hasta: 6e4,
		tipo: 37
	},
	{
		hasta: 3e5,
		tipo: 45
	},
	{
		hasta: Infinity,
		tipo: 47
	}
];
function cuotaIRPF(baseImponible, tramos = TRAMOS_IRPF_APROX) {
	let cuota = 0;
	let limiteAnterior = 0;
	for (const tramo of tramos) {
		if (baseImponible <= limiteAnterior) break;
		const baseTramo = Math.min(baseImponible, tramo.hasta) - limiteAnterior;
		cuota += baseTramo * (tramo.tipo / 100);
		limiteAnterior = tramo.hasta;
	}
	return cuota;
}
function tipoMarginalIRPF(baseImponible, tramos = TRAMOS_IRPF_APROX) {
	for (const tramo of tramos) if (baseImponible <= tramo.hasta) return tramo.tipo;
	return tramos[tramos.length - 1]?.tipo ?? 0;
}
var CATEGORIAS_RENDIMIENTO = ["Alquiler mensual", "Otros ingresos"];
function esGastoDeducibleIRPF(categoria) {
	return !CATEGORIAS_GASTO_NO_DEDUCIBLE_IRPF.includes(categoria);
}
function ingresoIrpfDeTx(t, propiedad, desde, hasta) {
	if (t.tipo !== "ingreso" || !CATEGORIAS_RENDIMIENTO.includes(t.categoria)) return 0;
	const bruto = miParte(t.categoria === "Alquiler mensual" ? alquilerEnRangoSinConceptos(t, propiedad, desde, hasta) : importeEnRango(t, desde, hasta), propiedad, t.soloMio);
	if (propiedad.tipo === "local" && t.categoria === "Alquiler mensual") return baseDesdeRentaNeta(bruto);
	return bruto;
}
function rendimientoIrpfPropiedad(propiedad, transacciones, anio, reduccionViviendaPct) {
	if (propiedad.sinRenta) return {
		propiedad,
		ingresos: 0,
		gastos: 0,
		amortizacion: 0,
		rendimientoNeto: 0,
		reducible: false,
		rendimientoComputable: 0
	};
	const [desde, hasta] = rangoAnio(anio);
	const txs = transacciones.filter((t) => t.propiedadId === propiedad.id);
	const ingresos = sumIngresosEnRango(propiedad, txs, desde, hasta, { irpf: true });
	const gastos = sumGastosEnRango(propiedad, txs, desde, hasta, { irpf: true });
	const amortizacion = amortizacionAnual(propiedad, anio);
	const rendimientoNeto = ingresos - gastos - amortizacion;
	const reducible = propiedad.tipo === "piso" || propiedad.tipo === "casa";
	return {
		propiedad,
		ingresos,
		gastos,
		amortizacion,
		rendimientoNeto,
		reducible,
		rendimientoComputable: reducible && rendimientoNeto > 0 ? rendimientoNeto * (1 - reduccionViviendaPct / 100) : rendimientoNeto
	};
}
function estimarAhorroRenta(propiedades, transacciones, ingresosExternos, anio, reduccionViviendaPct) {
	const [desdeAnio, hastaAnio] = rangoAnio(anio);
	const porPropiedad = propiedades.map((p) => rendimientoIrpfPropiedad(p, transacciones, anio, reduccionViviendaPct));
	const amortizacionTotal = porPropiedad.reduce((s, f) => s + f.amortizacion, 0);
	const rendimientoInmobiliarioTotal = porPropiedad.reduce((s, f) => s + f.rendimientoComputable, 0);
	const retencionLocales = propiedades.filter((p) => p.tipo === "local").reduce((sTotal, p) => {
		return sTotal + calcularRentaLocal(baseDesdeRentaNeta(transacciones.filter((t) => t.propiedadId === p.id && t.tipo === "ingreso" && t.categoria === "Alquiler mensual").reduce((s, t) => s + miParte(importeEnRango(t, desdeAnio, hastaAnio), p, t.soloMio), 0))).irpf;
	}, 0);
	const otrosIngresosTotal = ingresosExternos.reduce((s, i) => s + i.importeAnual, 0);
	const retencionOtrosIngresos = ingresosExternos.reduce((s, i) => s + i.importeAnual * (i.porcentajeRetencion / 100), 0);
	const baseImponibleTotal = otrosIngresosTotal + Math.max(0, rendimientoInmobiliarioTotal);
	const cuotaSoloOtrosIngresos = cuotaIRPF(otrosIngresosTotal);
	const cuotaTotal = cuotaIRPF(baseImponibleTotal);
	const tipoMarginalPct = tipoMarginalIRPF(baseImponibleTotal);
	const irpfEstimadoAlquileres = Math.max(0, cuotaTotal - cuotaSoloOtrosIngresos);
	const totalRetenido = retencionOtrosIngresos + retencionLocales;
	return {
		porPropiedad,
		amortizacionTotal,
		rendimientoInmobiliarioTotal,
		otrosIngresosTotal,
		baseImponibleTotal,
		tipoMarginalPct,
		cuotaTotal,
		irpfEstimadoAlquileres,
		retencionOtrosIngresos,
		retencionLocales,
		totalRetenido,
		aGuardar: Math.max(0, cuotaTotal - totalRetenido)
	};
}
var NOTA_RESUMEN_IRPF = "Orientativo: debe revisarse con la declaración.";
var CORTE_REDUCCION_VIVIENDA = "2023-05-26";
var CATEGORIA_INTERESES = "Intereses hipoteca";
var CATEGORIA_REPARACION = "Reparaciones";
var FALTA_CONSTRUCCION = "valor catastral de la construcción";
var FALTA_PROPORCION = "proporción de construcción";
var FALTA_ADQUISICION = "valor de adquisición";
var FALTA_ADQUISICION_HERENCIA = "valor de adquisición (valor declarado en la herencia)";
var FALTA_ZONA = "zona de mercado residencial tensionado";
var FALTA_REBAJA = "rebaja de la renta de más del 5 %";
var FALTA_JOVEN = "arrendatario de 18 a 35 años";
var FALTA_ADMIN = "arrendamiento a la Administración o a una entidad sin fines de lucro";
var FALTA_REHAB = "rehabilitación terminada en los dos años anteriores al contrato";
function desgloseGastosIrpf(propiedad, transacciones, desde, hasta) {
	const txs = txsDePropiedad(propiedad, transacciones);
	let intereses = 0;
	let reparaciones = 0;
	let otros = 0;
	for (const t of txs) {
		if (t.tipo !== "gasto" || esAguaOLuz(t.categoria) || !esGastoDeducibleIRPF(t.categoria)) continue;
		const n = miParte(cuotaOtrosEnRango(t, propiedad, desde, hasta).propietario, propiedad, t.soloMio);
		if (t.categoria === CATEGORIA_INTERESES) intereses += n;
		else if (t.categoria === CATEGORIA_REPARACION) reparaciones += n;
		else otros += n;
	}
	const { propietario } = desgloseSuministrosEnRango(propiedad, txs, desde, hasta);
	otros += miParte(propietario, propiedad);
	return {
		intereses: round2(intereses),
		reparaciones: round2(reparaciones),
		otros: round2(otros)
	};
}
function gastosDelAnio(propiedad, transacciones, anio) {
	const [desde, hasta] = rangoAnio(anio);
	return {
		ingresos: round2(sumIngresosEnRango(propiedad, transacciones, desde, hasta, { irpf: true })),
		...desgloseGastosIrpf(propiedad, transacciones, desde, hasta)
	};
}
function anioInicialArrastre(propiedad, transacciones, yFin) {
	let min = yFin;
	for (const t of txsDePropiedad(propiedad, transacciones)) {
		const y = Number(t.fecha.slice(0, 4));
		if (y >= 1990 && y < min) min = y;
	}
	return Math.min(min, yFin - 4);
}
function limiteGastosIrpf(propiedad, transacciones, anio) {
	const yFin = Number(anio);
	const lotes = [];
	const actual = gastosDelAnio(propiedad, transacciones, anio);
	let arrastreAplicado = 0;
	let excesoAnio = 0;
	for (let y = anioInicialArrastre(propiedad, transacciones, yFin); y <= yFin; y++) {
		const g = y === yFin ? actual : gastosDelAnio(propiedad, transacciones, String(y));
		const suma = round2(g.intereses + g.reparaciones);
		const room = round2(Math.max(0, g.ingresos - suma));
		let aplicado = 0;
		for (const lote of lotes) {
			if (lote.anio < y - 4 || lote.anio > y - 1 || lote.pendiente <= 0) continue;
			const cabe = round2(room - aplicado);
			if (cabe <= 0) break;
			const usa = round2(Math.min(lote.pendiente, cabe));
			lote.pendiente = round2(lote.pendiente - usa);
			aplicado = round2(aplicado + usa);
		}
		const exceso = round2(Math.max(0, suma - g.ingresos));
		if (exceso > 0) lotes.push({
			anio: y,
			pendiente: exceso
		});
		if (y === yFin) {
			arrastreAplicado = aplicado;
			excesoAnio = exceso;
		}
	}
	const deducidos = round2(actual.intereses + actual.reparaciones - excesoAnio);
	const gastosDeducibles = round2(actual.otros + deducidos + arrastreAplicado);
	const arrastrePendiente = round2(lotes.filter((l) => l.anio >= yFin - 3 && l.anio <= yFin).reduce((s, l) => s + l.pendiente, 0));
	return {
		...actual,
		limiteInteresesReparacion: actual.ingresos,
		excesoAnio,
		arrastreAplicado,
		arrastrePendiente,
		gastosDeducibles
	};
}
function proporcionValida(valor) {
	if (valor == null || !Number.isFinite(valor) || valor <= 0 || valor > 1) return null;
	return valor;
}
function baseAmortizacionIrpf(propiedad) {
	if (propiedad.sinRenta) return {
		baseParte: null,
		pendiente: []
	};
	const pendiente = [];
	const catastral = propiedad.valorConstruccion != null && propiedad.valorConstruccion > 0 ? propiedad.valorConstruccion : null;
	if (catastral == null) pendiente.push(FALTA_CONSTRUCCION);
	const proporcion = proporcionValida(propiedad.proporcionConstruccion);
	const coste = propiedad.valorAdquisicion != null && propiedad.valorAdquisicion > 0 ? propiedad.valorAdquisicion : null;
	let porAdquisicion = null;
	if (coste != null && proporcion != null) porAdquisicion = coste * proporcion;
	else {
		if (proporcion == null) pendiente.push(FALTA_PROPORCION);
		if (coste == null) pendiente.push(propiedad.tipoAdquisicion === "herencia" ? FALTA_ADQUISICION_HERENCIA : FALTA_ADQUISICION);
	}
	const candidatos = [catastral, porAdquisicion].filter((n) => n != null && n > 0);
	if (candidatos.length === 0) return {
		baseParte: null,
		pendiente
	};
	return {
		baseParte: round2(miParte(parteDeCuota(Math.max(...candidatos), cuotaEfectiva(propiedad.cuotaPropiedad)), propiedad)),
		pendiente: catastral == null || porAdquisicion == null ? pendiente : []
	};
}
function amortizacionIrpfAnio(propiedad, anio) {
	const diasAnio = diasDelAnio(anio);
	const diasAlquilados = propiedad.sinRenta ? 0 : diasAlquiladosEnAnio(propiedad, anio);
	const base = baseAmortizacionIrpf(propiedad);
	if (base.baseParte == null) return {
		importe: null,
		diasAlquilados,
		diasAnio,
		base: null,
		pendiente: base.pendiente
	};
	return {
		importe: round2(base.baseParte * (3 / 100) * (diasAlquilados / diasAnio)),
		diasAlquilados,
		diasAnio,
		base: base.baseParte,
		pendiente: base.pendiente
	};
}
function reduccionAlquilerVivienda(propiedad, anio) {
	if (propiedad.sinRenta || propiedad.tipo !== "piso" && propiedad.tipo !== "casa") return {
		estado: "no aplica",
		porcentaje: 0,
		falta: [],
		motivo: "No es alquiler de vivienda."
	};
	if (!propiedad.contratoInicio) return {
		estado: "pendiente de dato",
		porcentaje: null,
		falta: ["fecha de contrato"]
	};
	if (propiedad.contratoInicio < CORTE_REDUCCION_VIVIENDA || anio <= "2023") return {
		estado: "aplicada",
		porcentaje: 60,
		falta: [],
		motivo: propiedad.contratoInicio < CORTE_REDUCCION_VIVIENDA ? "Contrato anterior al 26-05-2023: reducción del 60 %." : "En 2023 la reducción del alquiler de vivienda sigue siendo del 60 %."
	};
	const s = propiedad.supuestosReduccion ?? {};
	const zona = s.zonaTensionada;
	const rebaja = s.rebajaRentaMasDe5;
	const joven = s.joven18a35;
	const admin = s.administracionOEntidad;
	const rehab = s.rehabilitacionDosAnios;
	const falta = [];
	if (zona == null) falta.push(FALTA_ZONA);
	if (zona !== false && rebaja == null) falta.push(FALTA_REBAJA);
	if (zona === true && rebaja === true) return {
		estado: "aplicada",
		porcentaje: 90,
		falta: [],
		motivo: "Zona tensionada y renta rebajada más de un 5 %."
	};
	const puede90 = zona !== false && rebaja !== false && (zona == null || rebaja == null);
	if (zona !== false && joven == null) falta.push(FALTA_JOVEN);
	if (admin == null) falta.push(FALTA_ADMIN);
	const es70 = zona === true && joven === true || admin === true;
	const puede70 = !es70 && (zona !== false && joven !== false && (zona == null || joven == null) || admin == null);
	if (rehab == null) falta.push(FALTA_REHAB);
	if (puede90 || puede70) return {
		estado: "pendiente de dato",
		porcentaje: null,
		falta
	};
	if (es70) return {
		estado: "aplicada",
		porcentaje: 70,
		falta: [],
		motivo: "Vivienda en zona tensionada a un joven, o alquiler a la Administración o a una entidad sin fines de lucro."
	};
	if (rehab == null) return {
		estado: "pendiente de dato",
		porcentaje: null,
		falta
	};
	if (rehab) return {
		estado: "aplicada",
		porcentaje: 60,
		falta: [],
		motivo: "Rehabilitación terminada en los dos años anteriores."
	};
	return {
		estado: "aplicada",
		porcentaje: 50,
		falta: [],
		motivo: "Contrato de vivienda desde el 26-05-2023 sin los supuestos del 90, 70 o 60 %."
	};
}
function resumenIrpfFinca(propiedad, transacciones, anio) {
	const gastos = limiteGastosIrpf(propiedad, transacciones, anio);
	const amort = amortizacionIrpfAnio(propiedad, anio);
	const reduccionBase = reduccionAlquilerVivienda(propiedad, anio);
	const rendimientoNeto = amort.importe == null ? null : round2(gastos.ingresos - gastos.gastosDeducibles - amort.importe);
	let importe = null;
	let reducido = null;
	if (rendimientoNeto != null && reduccionBase.estado !== "pendiente de dato" && reduccionBase.porcentaje != null) {
		importe = rendimientoNeto > 0 ? round2(rendimientoNeto * (reduccionBase.porcentaje / 100)) : 0;
		reducido = round2(rendimientoNeto - importe);
	}
	return {
		nombre: propiedad.nombre,
		porcentajeCopropiedad: propiedad.porcentajePropiedad ?? 100,
		ingresosIntegros: gastos.ingresos,
		gastosDeducibles: gastos.gastosDeducibles,
		intereses: gastos.intereses,
		reparaciones: gastos.reparaciones,
		otrosGastos: gastos.otros,
		limiteInteresesReparacion: gastos.limiteInteresesReparacion,
		excesoAnio: gastos.excesoAnio,
		arrastreAplicado: gastos.arrastreAplicado,
		arrastrePendiente: gastos.arrastrePendiente,
		amortizacion: amort.importe,
		diasAlquilados: amort.diasAlquilados,
		diasAnio: amort.diasAnio,
		baseAmortizacion: amort.base,
		rendimientoNeto,
		reduccion: {
			...reduccionBase,
			importe
		},
		rendimientoNetoReducido: reducido,
		pendiente: amort.pendiente
	};
}
function totalesIrpf(filas) {
	const suma = (campo) => round2(filas.reduce((s, f) => s + f[campo], 0));
	const sumaONull = (campo) => {
		if (filas.some((f) => f[campo] == null)) return null;
		return round2(filas.reduce((s, f) => s + (f[campo] ?? 0), 0));
	};
	return {
		ingresosIntegros: suma("ingresosIntegros"),
		gastosDeducibles: suma("gastosDeducibles"),
		excesoAnio: suma("excesoAnio"),
		arrastreAplicado: suma("arrastreAplicado"),
		amortizacion: sumaONull("amortizacion"),
		rendimientoNeto: sumaONull("rendimientoNeto"),
		rendimientoNetoReducido: sumaONull("rendimientoNetoReducido")
	};
}
function resumenIrpf(propiedades, transacciones, anio) {
	const porFinca = propiedades.filter((p) => esDeJose(p) && esRendimientoAlquiler(p)).map((p) => resumenIrpfFinca(p, transacciones, anio)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
	return {
		nota: NOTA_RESUMEN_IRPF,
		anio,
		porFinca,
		totales: totalesIrpf(porFinca)
	};
}
var PRIORIDAD_ORDEN = {
	alta: 0,
	media: 1,
	baja: 2
};
function tareaVencida(tarea, hoy = /* @__PURE__ */ new Date()) {
	if (tarea.estado === "hecha" || !tarea.fechaLimite) return false;
	const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
	return tarea.fechaLimite < hoyStr;
}
function ordenarTareas(tareas) {
	return [...tareas].sort((a, b) => {
		if (a.estado !== b.estado) return a.estado === "pendiente" ? -1 : 1;
		if (a.prioridad !== b.prioridad) return PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad];
		if (a.fechaLimite && b.fechaLimite) return a.fechaLimite.localeCompare(b.fechaLimite);
		if (a.fechaLimite) return -1;
		if (b.fechaLimite) return 1;
		return a.creadoEn.localeCompare(b.creadoEn);
	});
}
//#endregion
//#region scripts/mcp/consultar.ts
var ConsultaError = class extends Error {};
var AMBITO = "Fincas de Jose en alquiler, igual que Inicio, Estadísticas y Fiscal.";
function r2(n) {
	return Math.round(n * 100) / 100;
}
function argsDe$1(args) {
	if (args == null) return {};
	if (typeof args !== "object" || Array.isArray(args)) throw new ConsultaError("Los argumentos tienen que ser un objeto.");
	return args;
}
function textoOpcional(args, clave) {
	const valor = args[clave];
	if (valor == null || valor === "") return void 0;
	if (typeof valor !== "string") throw new ConsultaError(`"${clave}" tiene que ser texto.`);
	return valor.trim();
}
function anioDe(args, hoy) {
	const anio = textoOpcional(args, "anio");
	if (!anio) return String(hoy.getFullYear());
	if (!/^\d{4}$/.test(anio)) throw new ConsultaError("\"anio\" tiene que ser YYYY.");
	return anio;
}
function mesDe$1(args, hoy) {
	const mes = textoOpcional(args, "mes");
	if (!mes) return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ConsultaError("\"mes\" tiene que ser YYYY-MM.");
	return mes;
}
function trimestreDeNumero(args, hoy) {
	const valor = args.trimestre;
	const n = valor == null || valor === "" ? Math.ceil((hoy.getMonth() + 1) / 3) : Number(valor);
	if (!Number.isInteger(n) || n < 1 || n > 4) throw new ConsultaError("\"trimestre\" tiene que ser 1, 2, 3 o 4.");
	return n;
}
function entero(args, clave, defecto, maximo) {
	const valor = args[clave];
	if (valor == null || valor === "") return defecto;
	const n = Number(valor);
	if (!Number.isInteger(n) || n < 1 || n > maximo) throw new ConsultaError(`"${clave}" tiene que ser un entero entre 1 y ${maximo}.`);
	return n;
}
function normalizar(texto) {
	return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
function fincasDeJose(propiedades) {
	return propiedades.filter((p) => esDeJose(p) && esRendimientoAlquiler(p));
}
function resolverFinca(propiedades, consulta) {
	const q = normalizar(consulta);
	const porId = propiedades.find((p) => p.id === consulta.trim());
	if (porId) return porId;
	const exactas = propiedades.filter((p) => normalizar(p.nombre) === q);
	if (exactas.length === 1) return exactas[0];
	const parciales = propiedades.filter((p) => normalizar(p.nombre).includes(q));
	const elegidas = exactas.length > 1 ? exactas : parciales;
	if (elegidas.length === 1) return elegidas[0];
	if (elegidas.length === 0) throw new ConsultaError(`No hay ninguna finca que coincida con "${consulta}".`);
	throw new ConsultaError(`"${consulta}" coincide con varias fincas: ${elegidas.map((p) => p.nombre).join(", ")}. Usa el nombre completo.`);
}
function idDeArchivo(id) {
	if (!id) return void 0;
	const limpio = id.trim();
	if (!/^[A-Za-z0-9_-]+$/.test(limpio)) return void 0;
	return limpio;
}
function enlaceDrive(id) {
	return `https://drive.google.com/file/d/${id}/view`;
}
function revisionAnual(p) {
	if (p.sinRenta || p.estado !== "alquilado" || !p.contratoInicio) return void 0;
	const inicio = /* @__PURE__ */ new Date(`${p.contratoInicio}T00:00:00`);
	if (Number.isNaN(inicio.getTime())) return void 0;
	const desde = p.rentaRevisadaDesde ? new Date(p.rentaRevisadaDesde) : inicio;
	if (Number.isNaN(desde.getTime())) return void 0;
	let aniversario = new Date(desde.getFullYear(), inicio.getMonth(), inicio.getDate());
	if (aniversario <= desde) aniversario = new Date(desde.getFullYear() + 1, inicio.getMonth(), inicio.getDate());
	return {
		fecha: fechaISO(aniversario),
		tipo: "anual"
	};
}
function tramoPublico(tramo) {
	const publico = {
		id: tramo.id,
		vigenteDesde: tramo.vigenteDesde
	};
	if (tramo.alquilerMensual != null) publico.alquilerMensual = tramo.alquilerMensual;
	if (tramo.contratoFin) publico.contratoFin = tramo.contratoFin;
	if (tramo.fianzaImporte != null) publico.fianzaImporte = tramo.fianzaImporte;
	return publico;
}
function enlacesDe(p, transacciones) {
	const contrato = idDeArchivo(p.contratoArchivoId);
	const fianza = idDeArchivo(p.fianzaDepositoArchivoId);
	const vistos = /* @__PURE__ */ new Set();
	const facturas = [];
	const propias = transacciones.filter((t) => t.propiedadId === p.id && t.archivos.length > 0).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn) || a.id.localeCompare(b.id));
	for (const t of propias) for (const archivo of t.archivos) {
		const id = idDeArchivo(archivo);
		if (!id || vistos.has(id)) continue;
		vistos.add(id);
		facturas.push(enlaceDrive(id));
	}
	const enlaces = {};
	if (contrato) enlaces.contrato = enlaceDrive(contrato);
	if (fianza) enlaces.fianza = enlaceDrive(fianza);
	if (facturas.length > 0) enlaces.facturas = facturas;
	return Object.keys(enlaces).length > 0 ? enlaces : void 0;
}
function avisosVencimiento(p, hoy, fechaRevision) {
	const avisos = [];
	const sumar = (tipo, fecha, texto) => {
		const estado = contratoEstado(fecha, hoy);
		if (!fecha || !estado?.alerta) return;
		avisos.push({
			tipo,
			fecha,
			dias: estado.dias,
			mensaje: texto(estado.dias, estado.vencido)
		});
	};
	if (!p.sinRenta && p.estado === "alquilado") {
		sumar("contrato", p.contratoFin, (dias, vencido) => vencido ? "Contrato en tácita reconducción" : `Contrato vence en ${dias} días`);
		sumar("revision", fechaRevision, (dias) => dias <= 0 ? "Toca revisar la renta (IPC/IGC)" : `Revisión de renta en ${dias} días`);
	}
	sumar("cee", p.certificadoEnergeticoVencimiento, (dias, vencido) => vencido ? "Certificado energético caducado" : `CEE vence en ${dias} días`);
	sumar("seguro", p.seguroVencimiento, (dias, vencido) => vencido ? "Seguro caducado" : `Seguro vence en ${dias} días`);
	return avisos;
}
function datosDeContrato(p, hoy, transacciones) {
	const salida = {};
	if (p.contratoInicio) salida.contratoInicio = p.contratoInicio;
	if (p.contratoFin) salida.contratoFin = p.contratoFin;
	if (p.tramosContrato && p.tramosContrato.length > 0) salida.tramosContrato = p.tramosContrato.map(tramoPublico);
	if (p.fianzaImporte != null) salida.fianzaImporte = p.fianzaImporte;
	if (p.fianzaDepositadaDesde) salida.fianzaDepositadaDesde = p.fianzaDepositadaDesde;
	if (p.fianzaDepositoNumero) salida.fianzaDepositoNumero = p.fianzaDepositoNumero;
	if (p.seguroVencimiento) salida.seguroVencimiento = p.seguroVencimiento;
	const revision = revisionAnual(p);
	if (revision) salida.revisionRenta = revision;
	if (p.certificadoEnergeticoVencimiento) salida.certificadoEnergeticoVencimiento = p.certificadoEnergeticoVencimiento;
	if (p.ibiMes != null) salida.ibiMes = p.ibiMes;
	const enlaces = enlacesDe(p, transacciones);
	if (enlaces) salida.enlaces = enlaces;
	const avisos = avisosVencimiento(p, hoy, revision?.fecha);
	if (avisos.length > 0) salida.avisosVencimiento = avisos;
	return salida;
}
function fichaPublica(p, hoy, transacciones = []) {
	const inclusion = inclusionAguaLuz(repartoEfectivo(p));
	let aguaLuz = "sin configurar";
	if (inclusion?.modo === "parcial_conjunto") aguaLuz = `cupo ${inclusion.importeMensual ?? 30} €/mes`;
	else if (inclusion) aguaLuz = INCLUSION_AGUA_LUZ_LABEL[inclusion.modo];
	const valores = valoresProporcionales(p);
	return {
		id: p.id,
		nombre: p.nombre,
		tipo: p.tipo,
		estado: p.estado,
		municipio: p.municipio ?? null,
		direccion: p.direccion,
		inquilino: p.inquilinoNombre ?? null,
		alquilerMensual: alquilerVigente(p, void 0, hoy) ?? null,
		...p.conceptosFijos && p.conceptosFijos.length > 0 ? { conceptosFijos: p.conceptosFijos } : {},
		aguaLuz,
		porcentaje: p.porcentajePropiedad ?? 100,
		deJose: esDeJose(p),
		propietario: p.propietarioNombre ?? null,
		sinRenta: p.sinRenta ?? false,
		referenciaCatastral: p.referenciaCatastral ?? null,
		valorAdquisicion: p.valorAdquisicion ?? null,
		fechaAdquisicion: p.fechaAdquisicion ?? null,
		tipoAdquisicion: p.tipoAdquisicion ?? null,
		metrosCuadrados: p.metrosCuadrados ?? null,
		valorMercado: p.valorMercado ?? null,
		fechaValorMercado: p.fechaValorMercado ?? null,
		valorReferencia: p.valorReferencia ?? null,
		valorConstruccion: p.valorConstruccion ?? null,
		cuota: valores.cuota,
		valores,
		financiacion: p.financiacion ?? null,
		copropietarios: (p.copropietarios ?? []).map((c) => ({
			nombre: c.nombre,
			porcentaje: c.porcentaje
		})),
		...datosDeContrato(p, hoy, transacciones)
	};
}
function trimestreDeFecha(fecha) {
	return Math.ceil(parseInt(fecha.slice(5, 7), 10) / 3);
}
function hoyDelMes(mes, hoy) {
	if (mes === `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`) return hoy;
	const [anio, numero] = mes.split("-").map(Number);
	return new Date(anio, numero, 0);
}
var sinParametros = {
	type: "object",
	properties: {},
	additionalProperties: false
};
var herramientas = [
	{
		name: "listar_fincas",
		description: "Lista todas las fincas, también las de terceros, las de uso propio y las que no tienen renta. Devuelve la ficha de escritura y, si están guardados, el contrato, la fianza, el seguro, la revisión anual de la renta, el certificado energético, el mes del IBI y los avisos de vencimiento a 60 días. alquilerMensual es la renta vigente. Si hay conceptos fijos que paga el inquilino (p.ej. basura), los devuelve en conceptosFijos. El contrato, el resguardo y las facturas salen como enlace de Drive, no como id. No incluye DNI, email, teléfono ni NIF. Los totales de las otras herramientas ignoran las que no son de Jose o no están en alquiler.",
		inputSchema: sinParametros,
		ejecutar: (_args, foto, hoy) => ({ fincas: [...foto.propiedades].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((p) => fichaPublica(p, hoy, foto.transacciones)) })
	},
	{
		name: "cobros_pendientes",
		description: "Rentas del mes sin cobrar del todo, y deuda de meses ya cerrados. Mismo criterio que Inicio. En un local el importe es la neta, lo que entra en el banco.",
		inputSchema: {
			type: "object",
			properties: { mes: {
				type: "string",
				description: "YYYY-MM. Por defecto el mes actual. La deuda de meses cerrados no depende de este valor."
			} },
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const mes = mesDe$1(args, hoy);
			const dia = hoyDelMes(mes, hoy);
			const fincas = fincasDeJose(foto.propiedades);
			return {
				ambito: AMBITO,
				mes,
				pendientes: fincas.filter((p) => rentaDelMesIncompleta(p, foto.transacciones, dia)).map((p) => {
					const esperado = alquilerACobrar(p, `${mes}-01`, dia) ?? 0;
					const cobrado = cobradoAlquilerEnMes(p.id, foto.transacciones, mes);
					return {
						id: p.id,
						nombre: p.nombre,
						inquilino: p.inquilinoNombre ?? null,
						esperado: r2(esperado),
						cobrado: r2(cobrado),
						falta: r2(Math.max(0, esperado - cobrado))
					};
				}),
				deudas: fincas.flatMap((p) => {
					const deuda = deudaInquilino(p, foto.transacciones, hoy);
					if (!deuda || deuda.importe <= .005) return [];
					return [{
						id: p.id,
						nombre: p.nombre,
						importe: r2(deuda.importe),
						meses: deuda.meses
					}];
				})
			};
		}
	},
	{
		name: "huecos",
		description: "Meses recientes sin renta, agua o luz registrada. Igual que el aviso de la ficha: últimos 6 meses de ocupación. Sin \"finca\", solo las de Jose en alquiler.",
		inputSchema: {
			type: "object",
			properties: { finca: {
				type: "string",
				description: "Nombre o id. Si se omite, todas las de Jose en alquiler."
			} },
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const nombre = textoOpcional(args, "finca");
			const fincas = nombre ? [resolverFinca(foto.propiedades, nombre)] : fincasDeJose(foto.propiedades);
			const filas = fincas.flatMap((p) => huecosMensuales(p, foto.transacciones, hoy).map((h) => ({
				nombre: p.nombre,
				tipo: h.tipo,
				mes: h.mes
			})));
			return {
				ambito: nombre ? fincas[0].nombre : AMBITO,
				huecos: filas
			};
		}
	},
	{
		name: "avisos",
		description: "Avisos de ficha: huecos de registro, renta, fianza ICAVI, contrato, revisión, certificado energético, seguro y mes del IBI. Solo fincas de Jose en alquiler.",
		inputSchema: sinParametros,
		ejecutar: (_args, foto, hoy) => ({
			ambito: AMBITO,
			avisos: fincasDeJose(foto.propiedades).flatMap((p) => avisosDePropiedad(p, foto.transacciones, hoy).map((a) => ({
				finca: a.nombre,
				tipo: a.tipo,
				mensaje: a.mensaje
			})))
		})
	},
	{
		name: "resumen",
		description: "Ingresos, gastos y neto de un mes o de un año, ya a la parte de Jose. El gasto de agua y luz cuenta solo la parte incluida en el contrato. Pasa \"mes\" o \"anio\", no los dos.",
		inputSchema: {
			type: "object",
			properties: {
				mes: {
					type: "string",
					description: "YYYY-MM. Por defecto el mes actual si no pasas anio."
				},
				anio: {
					type: "string",
					description: "YYYY. El año entero."
				}
			},
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const mes = textoOpcional(args, "mes");
			const anio = textoOpcional(args, "anio");
			if (mes && anio) throw new ConsultaError("Pasa \"mes\" o \"anio\", no los dos.");
			const [desde, hasta] = anio ? rangoAnio(anioDe({ anio }, hoy)) : rangoMes(mesDe$1({ mes }, hoy));
			const fincas = fincasDeJose(foto.propiedades);
			const total = resumenVariasEnRango(fincas, foto.transacciones, desde, hasta);
			const porFinca = fincas.map((p) => {
				const r = resumenEnRango(p, foto.transacciones, desde, hasta);
				return {
					nombre: p.nombre,
					ingresos: r2(r.ingresos),
					gastos: r2(r.gastos),
					neto: r2(r.ingresos - r.gastos)
				};
			}).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
			const categorias = {};
			for (const p of fincas) for (const [cat, n] of Object.entries(gastosPorCategoriaEnRango(p, foto.transacciones, desde, hasta))) categorias[cat] = (categorias[cat] ?? 0) + n;
			const gastosPorCategoria = Object.entries(categorias).map(([categoria, importe]) => ({
				categoria,
				importe: r2(importe)
			})).filter((f) => f.importe !== 0).sort((a, b) => b.importe - a.importe);
			return {
				ambito: AMBITO,
				desde,
				hasta,
				ingresos: total.ingresos,
				gastos: total.gastos,
				neto: r2(total.ingresos - total.gastos),
				aRepercutir: total.inquilino,
				porFinca,
				gastosPorCategoria
			};
		}
	},
	{
		name: "modelo_420",
		description: "Modelo 420 y 115 de los locales de Jose. El IGIC se devenga con la renta pactada de cada mes ya empezado, se haya cobrado o no, y la cuota es la suma del IGIC de cada mes. El IRPF del 115 sigue la fecha de cobro. El IGIC soportado de los gastos se resta solo si el trimestre tiene renta devengada.",
		inputSchema: {
			type: "object",
			properties: {
				anio: {
					type: "string",
					description: "YYYY. Por defecto el año actual."
				},
				trimestre: {
					type: "integer",
					description: "1 a 4. Por defecto el trimestre actual."
				}
			},
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const anio = anioDe(args, hoy);
			const trimestre = trimestreDeNumero(args, hoy);
			const filas = fincasDeJose(foto.propiedades).filter((p) => p.tipo === "local").map((p) => {
				const devengo = devengoIgicLocalTrimestre(p, anio, trimestre, hoy);
				const irpf = r2(calcularRentaLocal(baseDesdeRentaNeta(foto.transacciones.filter((t) => t.propiedadId === p.id && t.tipo === "ingreso" && t.categoria === "Alquiler mensual" && t.fecha.startsWith(anio) && trimestreDeFecha(t.fecha) === trimestre).reduce((s, t) => s + miParte(t.importe, p, t.soloMio), 0))).irpf);
				const mesesSinCobrar = devengo.meses.filter((m) => {
					return baseDesdeRentaNeta(foto.transacciones.filter((t) => t.propiedadId === p.id && t.tipo === "ingreso" && t.categoria === "Alquiler mensual" && mesDelCobroAlquiler(t) === m.mes).reduce((s, t) => s + miParte(t.importe, p, t.soloMio), 0)) + .02 < m.base;
				}).map((m) => m.mes);
				const igicSoportado = devengo.base > 0 ? r2(foto.transacciones.filter((t) => t.propiedadId === p.id && t.tipo === "gasto" && t.fecha.startsWith(anio) && trimestreDeFecha(t.fecha) === trimestre).reduce((s, t) => s + miParte(t.igicSoportado ?? 0, p, t.soloMio), 0)) : 0;
				return {
					nombre: p.nombre,
					base: devengo.base,
					igic: devengo.igic,
					igicSoportado,
					igicAIngresar: r2(devengo.igic - igicSoportado),
					irpfRetenido: irpf,
					meses: devengo.meses,
					mesesSinCobrar
				};
			});
			return {
				ambito: AMBITO,
				anio,
				trimestre,
				base: r2(filas.reduce((s, f) => s + f.base, 0)),
				igic: r2(filas.reduce((s, f) => s + f.igic, 0)),
				igicSoportado: r2(filas.reduce((s, f) => s + f.igicSoportado, 0)),
				igicAIngresar: r2(filas.reduce((s, f) => s + f.igicAIngresar, 0)),
				irpfRetenido: r2(filas.reduce((s, f) => s + f.irpfRetenido, 0)),
				locales: filas
			};
		}
	},
	{
		name: "rendimiento",
		description: "Rendimiento de la pestaña Fiscal, sin la reducción por vivienda. El bloque \"estimador\" aplica esa reducción (por defecto 50) y es una aproximación, no la cuota oficial. Importes a la parte de Jose.",
		inputSchema: {
			type: "object",
			properties: {
				anio: {
					type: "string",
					description: "YYYY. Por defecto el año actual."
				},
				reduccion: {
					type: "number",
					description: "Porcentaje de reducción por vivienda en el estimador. Por defecto 50."
				}
			},
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const anio = anioDe(args, hoy);
			const reduccionRaw = args.reduccion;
			const reduccion = reduccionRaw == null || reduccionRaw === "" ? 50 : Number(reduccionRaw);
			if (!Number.isFinite(reduccion) || reduccion < 0 || reduccion > 100) throw new ConsultaError("\"reduccion\" tiene que ser un porcentaje entre 0 y 100.");
			const fincas = fincasDeJose(foto.propiedades);
			const porFinca = fincas.map((p) => {
				const r = rendimientoIrpfPropiedad(p, foto.transacciones, anio, 0);
				return {
					nombre: p.nombre,
					tipo: p.tipo,
					ingresos: r2(r.ingresos),
					gastos: r2(r.gastos),
					amortizacion: r2(r.amortizacion),
					neto: r2(r.ingresos - r.gastos)
				};
			}).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
			const estimacion = estimarAhorroRenta(fincas, foto.transacciones, foto.ingresosExternos, anio, reduccion);
			return {
				ambito: AMBITO,
				anio,
				porFinca,
				totales: {
					ingresos: r2(porFinca.reduce((s, f) => s + f.ingresos, 0)),
					gastos: r2(porFinca.reduce((s, f) => s + f.gastos, 0)),
					amortizacion: r2(porFinca.reduce((s, f) => s + f.amortizacion, 0)),
					neto: r2(porFinca.reduce((s, f) => s + f.neto, 0))
				},
				estimador: {
					nota: "Aproximación del estimador de la app, no la declaración.",
					reduccionViviendaPct: reduccion,
					rendimientoInmobiliario: r2(estimacion.rendimientoInmobiliarioTotal),
					otrosIngresos: r2(estimacion.otrosIngresosTotal),
					baseImponible: r2(estimacion.baseImponibleTotal),
					cuotaTotal: r2(estimacion.cuotaTotal),
					retenido: r2(estimacion.totalRetenido),
					aGuardar: r2(estimacion.aGuardar)
				}
			};
		}
	},
	{
		name: "rentabilidad",
		description: "Rentabilidad bruta y neta sobre el valor de mercado, por finca y en total, de los últimos 12 meses y de un año natural. Bruta = rentas / valor. Neta = (rentas − gastos) / valor. Sin valor de mercado, bruta y neta son null y viene el motivo. Los meses vacíos son meses ya empezados sin contrato vigente. No es el ranking de la app.",
		inputSchema: {
			type: "object",
			properties: { anio: {
				type: "string",
				description: "Año natural YYYY. Por defecto el año actual. Los últimos 12 meses no dependen de este año."
			} },
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const anio = anioDe(args, hoy);
			const [desdeAnio, hastaAnio] = rangoAnio(anio);
			const ventana = rangoUltimosMeses(hoy, 12);
			return {
				ambito: AMBITO,
				hoy: fechaISO(hoy),
				ultimos12Meses: rentabilidadCartera(foto.propiedades, foto.transacciones, ventana.desde, ventana.hasta, hoy),
				anio: {
					anio,
					...rentabilidadCartera(foto.propiedades, foto.transacciones, desdeAnio, hastaAnio, hoy)
				}
			};
		}
	},
	{
		name: "resumen_irpf",
		description: "Resumen anual de IRPF por finca: ingresos íntegros, gastos deducibles (intereses y reparación limitados a los ingresos, con arrastre de 4 años), amortización del 3 % por días alquilados y reducción por alquiler de vivienda. A la parte de Jose. Si falta un dato para elegir la reducción, lo dice y no inventa el porcentaje. Es orientativo y hay que revisarlo con la declaración. No incluye DNI, email, teléfono ni NIF.",
		inputSchema: {
			type: "object",
			properties: { anio: {
				type: "string",
				description: "YYYY. Por defecto el año actual."
			} },
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const anio = anioDe(args, hoy);
			return {
				ambito: AMBITO,
				...resumenIrpf(foto.propiedades, foto.transacciones, anio)
			};
		}
	},
	{
		name: "repercutir",
		description: "Lo que se puede repercutir al inquilino (agua, luz, basuras, IBI y el resto no incluido). Pasa \"anio\" o \"mes\". Con \"finca\" añade el total de cada mes, sin el detalle de cada factura.",
		inputSchema: {
			type: "object",
			properties: {
				anio: {
					type: "string",
					description: "YYYY. Por defecto el año actual si no pasas mes."
				},
				mes: {
					type: "string",
					description: "YYYY-MM."
				},
				finca: {
					type: "string",
					description: "Nombre o id. Si se omite, todas las de Jose en alquiler."
				}
			},
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const mes = textoOpcional(args, "mes");
			const anio = textoOpcional(args, "anio");
			if (mes && anio) throw new ConsultaError("Pasa \"mes\" o \"anio\", no los dos.");
			const [desde, hasta] = mes ? rangoMes(mesDe$1({ mes }, hoy)) : rangoAnio(anioDe({ anio }, hoy));
			const nombre = textoOpcional(args, "finca");
			const fincas = nombre ? [resolverFinca(foto.propiedades, nombre)] : fincasDeJose(foto.propiedades);
			const filas = filasRepercutibles(fincas, foto.transacciones, desde, hasta).map((f) => ({
				nombre: f.propiedad.nombre,
				total: f.total,
				porCategoria: f.porCategoria
			}));
			const meses = nombre ? desgloseSuministrosPorMes(fincas[0], foto.transacciones, desde, hasta).map((m) => ({
				mes: m.mes,
				facturado: m.facturado,
				propietario: m.propietario,
				inquilino: m.inquilino
			})) : void 0;
			return {
				ambito: nombre ? fincas[0].nombre : AMBITO,
				desde,
				hasta,
				total: r2(filas.reduce((s, f) => s + f.total, 0)),
				filas,
				meses
			};
		}
	},
	{
		name: "tareas",
		description: "Tareas pendientes de todas las fincas, incluidas las de terceros. No incluye las hechas.",
		inputSchema: sinParametros,
		ejecutar: (_args, foto, hoy) => {
			const nombres = new Map(foto.propiedades.map((p) => [p.id, p.nombre]));
			return { tareas: ordenarTareas(foto.tareas.filter((t) => t.estado === "pendiente")).map((t) => ({
				finca: nombres.get(t.propiedadId) ?? t.propiedadId,
				titulo: t.titulo,
				prioridad: t.prioridad,
				fechaLimite: t.fechaLimite ?? null,
				vencida: tareaVencida(t, hoy),
				id: t.id,
				descripcion: t.descripcion ? t.descripcion.slice(0, 200) : null
			})) };
		}
	},
	{
		name: "movimientos",
		description: "Movimientos de una finca entre dos fechas, los más recientes primero. Por defecto el año actual y como mucho 40. No incluye archivos de Drive.",
		inputSchema: {
			type: "object",
			properties: {
				finca: {
					type: "string",
					description: "Nombre o id. Obligatorio."
				},
				desde: {
					type: "string",
					description: "YYYY-MM-DD. Por defecto el 1 de enero del año actual."
				},
				hasta: {
					type: "string",
					description: "YYYY-MM-DD. Por defecto el 31 de diciembre del año actual."
				},
				limite: {
					type: "integer",
					description: "Entre 1 y 100. Por defecto 40."
				}
			},
			required: ["finca"],
			additionalProperties: false
		},
		ejecutar: (args, foto, hoy) => {
			const nombre = textoOpcional(args, "finca");
			if (!nombre) throw new ConsultaError("Falta \"finca\".");
			const finca = resolverFinca(foto.propiedades, nombre);
			const anio = String(hoy.getFullYear());
			const desde = textoOpcional(args, "desde") ?? `${anio}-01-01`;
			const hasta = textoOpcional(args, "hasta") ?? `${anio}-12-31`;
			if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new ConsultaError("\"desde\" y \"hasta\" tienen que ser YYYY-MM-DD.");
			const limite = entero(args, "limite", 40, 100);
			const todas = foto.transacciones.filter((t) => t.propiedadId === finca.id && t.fecha >= desde && t.fecha <= hasta).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn));
			return {
				finca: finca.nombre,
				desde,
				hasta,
				total: todas.length,
				devueltos: Math.min(limite, todas.length),
				movimientos: todas.slice(0, limite).map((t) => ({
					id: t.id,
					fecha: t.fecha,
					tipo: t.tipo,
					categoria: t.categoria,
					importe: r2(t.importe),
					descripcion: t.descripcion,
					periodoInicio: t.periodoInicio ?? null,
					periodoFin: t.periodoFin ?? null,
					numeroFactura: t.numeroFactura ?? null,
					igicSoportado: t.igicSoportado ?? null
				}))
			};
		}
	}
];
function ejecutar(nombre, args, foto, hoy = /* @__PURE__ */ new Date()) {
	const herramienta = herramientas.find((h) => h.name === nombre);
	if (!herramienta) throw new ConsultaError(`No existe la herramienta "${nombre}".`);
	return herramienta.ejecutar(argsDe$1(args), foto, hoy);
}
//#endregion
//#region scripts/mcp/escribir.ts
var CLAVES = /* @__PURE__ */ new Set([
	"registrar_cobro",
	"registrar_gasto",
	"cerrar_tarea",
	"fijar_ficha"
]);
function esEscritura(nombre) {
	return CLAVES.has(nombre);
}
var esquemaComun = {
	clave: {
		type: "string",
		description: "Obligatoria si confirmar es true. De 8 a 80 caracteres estables. La misma clave no escribe dos veces."
	},
	confirmar: {
		type: "boolean",
		description: "Por defecto false: solo enseña lo que se guardaría. true lo escribe."
	}
};
var fichasEscritura = [
	{
		name: "registrar_cobro",
		description: "Registra un ingreso en una finca. Por defecto es el alquiler del mes, con el periodo de ese mes. En un local el importe es la neta que entra en el banco. Sin confirmar:true no escribe. No genera factura ni toca archivos.",
		inputSchema: {
			type: "object",
			properties: {
				finca: {
					type: "string",
					description: "Nombre o id."
				},
				importe: {
					type: "string",
					description: "Euros. Admite 1.200,50."
				},
				fecha: {
					type: "string",
					description: "YYYY-MM-DD. Por defecto hoy. Es el día en que entra el dinero."
				},
				mes: {
					type: "string",
					description: "YYYY-MM del alquiler que se paga. Por defecto el mes de la fecha."
				},
				categoria: {
					type: "string",
					description: `Por defecto Alquiler mensual. Una de: ${CATEGORIAS_INGRESO.join(", ")}.`
				},
				descripcion: { type: "string" },
				soloMio: {
					type: "boolean",
					description: "true cuenta el 100% para Jose en una finca a medias."
				},
				...esquemaComun
			},
			required: ["finca", "importe"],
			additionalProperties: false
		}
	},
	{
		name: "registrar_gasto",
		description: "Registra un gasto en una finca. La categoría tiene que ser una de la app. El IGIC soportado solo vale en un local. numeroFactura (1 a 60, se guarda sin espacios y en mayúsculas) no puede repetirse en la misma finca: la vista previa ya lo rechaza. periodoInicio y periodoFin son YYYY-MM-DD y el inicio no puede ser posterior al fin. Sin esos campos el gasto se guarda como hasta ahora. Sin confirmar:true no escribe.",
		inputSchema: {
			type: "object",
			properties: {
				finca: {
					type: "string",
					description: "Nombre o id."
				},
				importe: {
					type: "string",
					description: "Euros. Admite 1.200,50."
				},
				categoria: {
					type: "string",
					description: CATEGORIAS_GASTO.join(", ")
				},
				fecha: {
					type: "string",
					description: "YYYY-MM-DD. Por defecto hoy."
				},
				mes: {
					type: "string",
					description: "YYYY-MM del periodo facturado, si no pasas periodoInicio y periodoFin."
				},
				periodoInicio: {
					type: "string",
					description: "YYYY-MM-DD. Junto con periodoFin."
				},
				periodoFin: {
					type: "string",
					description: "YYYY-MM-DD. No puede ser anterior a periodoInicio."
				},
				numeroFactura: {
					type: "string",
					description: "Número de la factura del proveedor. De 1 a 60 caracteres. Único en la finca."
				},
				descripcion: { type: "string" },
				igicSoportado: {
					type: "number",
					description: "IGIC incluido en el gasto. Solo en locales."
				},
				soloMio: { type: "boolean" },
				...esquemaComun
			},
			required: [
				"finca",
				"importe",
				"categoria"
			],
			additionalProperties: false
		}
	},
	{
		name: "fijar_ficha",
		description: "Actualiza la ficha de un inmueble que ya existe. Escritura: referencia catastral, valor y fecha de adquisición (herencia, donación o compra; el valor declarado va en valorAdquisicion), m², valores de mercado, referencia y construcción, cuota (número o fracción 1/12), sinRenta, financiación y copropietarios (solo nombre y %). Contrato: alquilerMensual abre un tramo desde fechaEfecto (no pisa la renta anterior), aguaLuz (incluido, no_incluido o parcial_conjunto) y conceptosFijos (importes que el inquilino paga cada mes además de la renta, p.ej. basura). Sin confirmar:true no escribe y devuelve el antes y el después. Si cambia la renta, la vista previa trae el importe anterior, el nuevo y la fecha. Al confirmar hace falta clave. No crea inmuebles: uno nuevo se da de alta en la app. No toca DNI, email, teléfono ni NIF.",
		inputSchema: {
			type: "object",
			properties: {
				finca: {
					type: "string",
					description: "Nombre o id de un inmueble que ya existe."
				},
				campos: {
					type: "object",
					description: "Solo los campos a cambiar. referenciaCatastral, valorAdquisicion, fechaAdquisicion, tipoAdquisicion (herencia|donacion|compra), metrosCuadrados, valorMercado, fechaValorMercado, valorReferencia, valorConstruccion, cuotaPropiedad (número o texto a/b), sinRenta, financiacion {capitalPendiente, cuotaMensual, tipoInteres, fechaFin}, copropietarios [{nombre, porcentaje}] que sumen 100, alquilerMensual (>0, obliga a fechaEfecto YYYY-MM-DD y abre un tramo), aguaLuz {modo: incluido|no_incluido|parcial_conjunto, importeMensual si es parcial_conjunto}, conceptosFijos [{concepto, importeMensual}]. null borra el campo.",
					properties: {
						referenciaCatastral: { type: "string" },
						valorAdquisicion: { type: "number" },
						fechaAdquisicion: { type: "string" },
						tipoAdquisicion: { type: "string" },
						metrosCuadrados: { type: "number" },
						valorMercado: { type: "number" },
						fechaValorMercado: { type: "string" },
						valorReferencia: { type: "number" },
						valorConstruccion: { type: "number" },
						cuotaPropiedad: {},
						sinRenta: { type: "boolean" },
						financiacion: { type: "object" },
						copropietarios: { type: "array" },
						alquilerMensual: {
							type: "number",
							description: "Nueva renta, mayor que 0. Crea un tramo; no sustituye el historial."
						},
						fechaEfecto: {
							type: "string",
							description: "YYYY-MM-DD. Obligatoria si va alquilerMensual. vigenteDesde del tramo."
						},
						aguaLuz: {
							type: "object",
							properties: {
								modo: {
									type: "string",
									description: "incluido, no_incluido o parcial_conjunto."
								},
								importeMensual: {
									type: "number",
									description: "Obligatorio si modo es parcial_conjunto. Mayor que 0."
								}
							}
						},
						conceptosFijos: {
							type: "array",
							items: {
								type: "object",
								properties: {
									concepto: {
										type: "string",
										description: "De 1 a 40 caracteres."
									},
									importeMensual: {
										type: "number",
										description: "Mayor que 0."
									}
								}
							}
						}
					},
					additionalProperties: false
				},
				...esquemaComun
			},
			required: ["finca", "campos"],
			additionalProperties: false
		}
	},
	{
		name: "cerrar_tarea",
		description: "Marca una tarea pendiente como hecha. Pasa id o finca más titulo. Sin confirmar:true no escribe.",
		inputSchema: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "Id que devuelve tareas."
				},
				finca: {
					type: "string",
					description: "Nombre o id, si no pasas id."
				},
				titulo: { type: "string" },
				...esquemaComun
			},
			additionalProperties: false
		}
	}
];
function argsDe(args) {
	if (args == null) return {};
	if (typeof args !== "object" || Array.isArray(args)) throw new ConsultaError("Los argumentos tienen que ser un objeto.");
	return args;
}
function texto$2(args, clave) {
	const valor = args[clave];
	if (valor == null || valor === "") return void 0;
	if (typeof valor !== "string") throw new ConsultaError(`"${clave}" tiene que ser texto.`);
	return valor.trim() || void 0;
}
function fechaHoy(hoy) {
	const mes = String(hoy.getMonth() + 1).padStart(2, "0");
	const dia = String(hoy.getDate()).padStart(2, "0");
	return `${hoy.getFullYear()}-${mes}-${dia}`;
}
function fechaTexto(valor, etiqueta) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new ConsultaError(`"${etiqueta}" tiene que ser YYYY-MM-DD.`);
	const [anio, mes, dia] = valor.split("-").map(Number);
	const comprobada = new Date(Date.UTC(anio, mes - 1, dia));
	if (comprobada.getUTCFullYear() !== anio || comprobada.getUTCMonth() !== mes - 1 || comprobada.getUTCDate() !== dia) throw new ConsultaError(`"${etiqueta}" no existe.`);
	return valor;
}
function fechaDe(args, hoy) {
	return fechaTexto(texto$2(args, "fecha") ?? fechaHoy(hoy), "fecha");
}
function periodoExplicito(args) {
	const inicio = texto$2(args, "periodoInicio");
	const fin = texto$2(args, "periodoFin");
	if (!inicio && !fin) return void 0;
	if (!inicio || !fin) throw new ConsultaError("El periodo necesita \"periodoInicio\" y \"periodoFin\".");
	const desde = fechaTexto(inicio, "periodoInicio");
	const hasta = fechaTexto(fin, "periodoFin");
	if (desde > hasta) throw new ConsultaError("El periodo no puede terminar antes de empezar.");
	return {
		inicio: desde,
		fin: hasta
	};
}
function numeroFacturaDe(args) {
	const crudo = texto$2(args, "numeroFactura");
	if (!crudo) return void 0;
	const leido = interpretarNumeroFactura(crudo);
	if (leido.error || !leido.numero) throw new ConsultaError(leido.error ?? "\"numeroFactura\" no es válido.");
	return leido.numero;
}
function intencionDe(args) {
	const datos = argsDe(args);
	const confirmar = confirmarDe(datos);
	return {
		confirmar,
		clave: claveDe(datos, confirmar)
	};
}
function mesDe(args, fecha) {
	const mes = texto$2(args, "mes") ?? fecha.slice(0, 7);
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ConsultaError("\"mes\" tiene que ser YYYY-MM.");
	return mes;
}
function finDeMes(mes) {
	const [anio, numero] = mes.split("-").map(Number);
	const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
	return `${mes}-${String(ultimo).padStart(2, "0")}`;
}
function euros(args, clave) {
	const valor = args[clave];
	const n = typeof valor === "number" ? valor : typeof valor === "string" ? parseImporte(valor) : NaN;
	if (!Number.isFinite(n) || n <= 0) throw new ConsultaError(`"${clave}" tiene que ser un importe mayor que cero.`);
	return Math.round(n * 100) / 100;
}
function eurosOpcional(args, clave) {
	if (args[clave] == null || args[clave] === "") return void 0;
	return euros(args, clave);
}
function bandera(args, clave) {
	const valor = args[clave];
	if (valor == null || valor === "") return void 0;
	if (valor === true || valor === "true") return true;
	if (valor === false || valor === "false") return false;
	throw new ConsultaError(`"${clave}" tiene que ser true o false.`);
}
function claveDe(args, confirmar) {
	const clave = texto$2(args, "clave");
	if (!clave) {
		if (confirmar) throw new ConsultaError("Para escribir hace falta \"clave\", un texto estable para no duplicar.");
		return;
	}
	if (!/^[A-Za-z0-9._:-]{8,80}$/.test(clave)) throw new ConsultaError("\"clave\" tiene que tener entre 8 y 80 letras, números, puntos, guiones o dos puntos.");
	return clave;
}
function confirmarDe(args) {
	return bandera(args, "confirmar") ?? false;
}
function movimientoDe(t, finca) {
	return {
		id: t.id,
		finca: finca.nombre,
		fecha: t.fecha,
		tipo: t.tipo,
		categoria: t.categoria,
		importe: t.importe,
		descripcion: t.descripcion,
		periodoInicio: t.periodoInicio ?? null,
		periodoFin: t.periodoFin ?? null,
		numeroFactura: t.numeroFactura ?? null,
		soloMio: t.soloMio ?? false,
		igicSoportado: t.igicSoportado ?? null
	};
}
var INSERT_MOVIMIENTO = `insert into transacciones (
  id, propiedad_id, fecha, tipo, importe, categoria, descripcion, archivos, creado_en,
  periodo_inicio, periodo_fin, solo_mio, igic_soportado, numero_factura
) values ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8,$9,$10,$11,$12,$13)`;
var COLUMNAS_FICHA = {
	referenciaCatastral: "referencia_catastral",
	valorAdquisicion: "valor_adquisicion",
	fechaAdquisicion: "fecha_adquisicion",
	tipoAdquisicion: "tipo_adquisicion",
	metrosCuadrados: "metros_cuadrados",
	valorMercado: "valor_mercado",
	fechaValorMercado: "fecha_valor_mercado",
	valorReferencia: "valor_referencia",
	valorConstruccion: "valor_construccion",
	sinRenta: "sin_renta"
};
function sqlFicha(id, parche, extra = {}) {
	const sets = [];
	const params = [];
	const add = (columna, valor, cast = "") => {
		params.push(valor);
		sets.push(`${columna} = $${params.length}${cast}`);
	};
	for (const campo of Object.keys(COLUMNAS_FICHA)) {
		if (!(campo in parche)) continue;
		add(COLUMNAS_FICHA[campo], parche[campo] ?? null);
	}
	if ("cuotaPropiedad" in parche) {
		const cuota = parche.cuotaPropiedad;
		add("cuota_numerador", cuota?.numerador ?? null);
		add("cuota_denominador", cuota?.denominador ?? null);
		add("cuota_valor", cuota?.valor ?? null);
	}
	if ("financiacion" in parche) add("financiacion", parche.financiacion ? JSON.stringify(parche.financiacion) : null, "::jsonb");
	if ("copropietarios" in parche) {
		const lista = parche.copropietarios;
		add("copropietarios", lista && lista.length > 0 ? JSON.stringify(lista) : null, "::jsonb");
	}
	if ("tramosContrato" in extra) add("tramos_contrato", JSON.stringify(extra.tramosContrato ?? []), "::jsonb");
	if ("alquilerMensual" in extra) add("alquiler_mensual", extra.alquilerMensual ?? null);
	if ("contratoFin" in extra) add("contrato_fin", extra.contratoFin ?? null);
	if ("fianzaImporte" in extra) add("fianza_importe", extra.fianzaImporte ?? null);
	if ("rentaRevisadaDesde" in extra) add("renta_revisada_desde", extra.rentaRevisadaDesde ?? null);
	if ("reparto" in extra) add("reparto", extra.reparto ? JSON.stringify(extra.reparto) : null, "::jsonb");
	if ("conceptosFijos" in extra) {
		const lista = extra.conceptosFijos;
		add("conceptos_fijos", lista && lista.length > 0 ? JSON.stringify(lista) : null, "::jsonb");
	}
	if (sets.length === 0) throw new ConsultaError("No hay ningún campo que guardar.");
	params.push(id);
	return {
		sql: `update propiedades set ${sets.join(", ")} where id = $${params.length}`,
		params
	};
}
var CAMPOS_EXTRA = /* @__PURE__ */ new Set([
	"alquilerMensual",
	"fechaEfecto",
	"aguaLuz",
	"conceptosFijos"
]);
var MODOS_AGUA_LUZ = /* @__PURE__ */ new Set([
	"incluido",
	"no_incluido",
	"parcial_conjunto"
]);
function partirCampos(entrada) {
	if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new ConsultaError("\"campos\" tiene que ser un objeto.");
	const ficha = {};
	const extra = {};
	for (const [clave, valor] of Object.entries(entrada)) if (CAMPOS_EXTRA.has(clave)) extra[clave] = valor;
	else ficha[clave] = valor;
	return {
		ficha,
		extra
	};
}
function importePositivo(valor, etiqueta) {
	const n = typeof valor === "number" ? valor : typeof valor === "string" ? parseImporte(valor) : NaN;
	if (!Number.isFinite(n) || n <= 0) throw new ConsultaError(`"${etiqueta}" tiene que ser un importe mayor que cero.`);
	return Math.round(n * 100) / 100;
}
function leerAguaLuz(valor) {
	if (valor == null) return null;
	if (typeof valor !== "object" || Array.isArray(valor)) throw new ConsultaError("\"aguaLuz\" tiene que ser un objeto.");
	const datos = valor;
	const modo = datos.modo;
	if (typeof modo !== "string" || !MODOS_AGUA_LUZ.has(modo)) throw new ConsultaError("\"aguaLuz.modo\" tiene que ser incluido, no_incluido o parcial_conjunto.");
	if (modo === "parcial_conjunto") return {
		modo,
		importeMensual: importePositivo(datos.importeMensual, "aguaLuz.importeMensual")
	};
	return { modo };
}
function leerConceptosFijos(valor) {
	if (valor == null) return null;
	if (!Array.isArray(valor) || valor.length === 0) throw new ConsultaError("\"conceptosFijos\" tiene que ser una lista con al menos un concepto.");
	return valor.map((item, i) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new ConsultaError(`"conceptosFijos[${i}]" tiene que ser un objeto.`);
		const datos = item;
		if (typeof datos.concepto !== "string") throw new ConsultaError(`"conceptosFijos[${i}].concepto" tiene que ser texto.`);
		const concepto = datos.concepto.trim();
		if (concepto.length < 1 || concepto.length > 40) throw new ConsultaError(`"conceptosFijos[${i}].concepto" tiene que tener entre 1 y 40 caracteres.`);
		return {
			concepto,
			importeMensual: importePositivo(datos.importeMensual, `conceptosFijos[${i}].importeMensual`)
		};
	});
}
function ordenFicha(finca, entrada, confirmar, clave, hoy, transacciones) {
	const { ficha: entradaFicha, extra } = partirCampos(entrada);
	if (Object.keys(entradaFicha).length === 0 && Object.keys(extra).length === 0) throw new ConsultaError("No hay ningún campo que guardar.");
	let parche = {};
	if (Object.keys(entradaFicha).length > 0) try {
		parche = interpretarCamposFicha(entradaFicha, fechaDeHoy(hoy));
	} catch (err) {
		if (err instanceof FichaError) throw new ConsultaError(err.message);
		throw err;
	}
	const cambios = cambiosDeFicha(finca, parche);
	let siguiente = fusionarFicha(finca, parche);
	const extraSql = {};
	if ("aguaLuz" in extra) {
		const agua = leerAguaLuz(extra.aguaLuz);
		const reparto = { ...siguiente.reparto ?? {} };
		if (agua == null) delete reparto.aguaLuz;
		else reparto.aguaLuz = agua;
		const antes = finca.reparto?.aguaLuz ?? null;
		siguiente = {
			...siguiente,
			reparto: Object.keys(reparto).length > 0 ? reparto : void 0
		};
		cambios.push({
			campo: "aguaLuz",
			antes,
			despues: siguiente.reparto?.aguaLuz ?? null
		});
		extraSql.reparto = siguiente.reparto ?? null;
	}
	if ("conceptosFijos" in extra) {
		const lista = leerConceptosFijos(extra.conceptosFijos);
		cambios.push({
			campo: "conceptosFijos",
			antes: finca.conceptosFijos ?? null,
			despues: lista
		});
		siguiente = {
			...siguiente,
			conceptosFijos: lista ?? void 0
		};
		extraSql.conceptosFijos = lista;
	}
	let renta;
	if ("alquilerMensual" in extra || "fechaEfecto" in extra) {
		if (!("alquilerMensual" in extra)) throw new ConsultaError("\"fechaEfecto\" solo vale junto con alquilerMensual.");
		if (extra.fechaEfecto == null || extra.fechaEfecto === "") throw new ConsultaError("Para cambiar el alquiler hace falta \"fechaEfecto\" (YYYY-MM-DD).");
		if (typeof extra.fechaEfecto !== "string") throw new ConsultaError("\"fechaEfecto\" tiene que ser YYYY-MM-DD.");
		const fechaEfecto = fechaTexto(extra.fechaEfecto.trim(), "fechaEfecto");
		const despues = importePositivo(extra.alquilerMensual, "alquilerMensual");
		const antes = alquilerVigente(siguiente, diaAnteriorISO(fechaEfecto), hoy) ?? null;
		const resultado = aplicarCambioCondiciones(siguiente, {
			vigenteDesde: fechaEfecto,
			alquilerMensual: despues
		}, hoy);
		if (!resultado.ok) throw new ConsultaError(resultado.error);
		siguiente = resultado.propiedad;
		renta = {
			antes,
			despues,
			fechaEfecto
		};
		extraSql.tramosContrato = siguiente.tramosContrato ?? [];
		if ((siguiente.alquilerMensual ?? null) !== (finca.alquilerMensual ?? null)) extraSql.alquilerMensual = siguiente.alquilerMensual ?? null;
		if ((siguiente.contratoFin ?? null) !== (finca.contratoFin ?? null)) extraSql.contratoFin = siguiente.contratoFin ?? null;
		if ((siguiente.fianzaImporte ?? null) !== (finca.fianzaImporte ?? null)) extraSql.fianzaImporte = siguiente.fianzaImporte ?? null;
		if ((siguiente.rentaRevisadaDesde ?? null) !== (finca.rentaRevisadaDesde ?? null)) extraSql.rentaRevisadaDesde = siguiente.rentaRevisadaDesde ?? null;
	}
	const ficha = fichaPublica(siguiente, hoy, transacciones);
	const sentencia = sqlFicha(finca.id, parche, extraSql);
	const comun = {
		finca: finca.nombre,
		cambios,
		ficha,
		...renta ? { renta } : {}
	};
	return {
		herramienta: "fijar_ficha",
		confirmar,
		clave,
		vista: {
			escrito: false,
			vistaPrevia: true,
			...comun
		},
		sentencias: [sentencia],
		resultado: {
			escrito: true,
			repetida: false,
			...comun
		}
	};
}
function ordenMovimiento(herramienta, t, finca, confirmar, clave) {
	const movimiento = movimientoDe(t, finca);
	const resultado = {
		escrito: true,
		repetida: false,
		movimiento
	};
	return {
		herramienta,
		confirmar,
		clave,
		vista: {
			escrito: false,
			vistaPrevia: true,
			movimiento
		},
		sentencias: [{
			sql: INSERT_MOVIMIENTO,
			params: [
				t.id,
				t.propiedadId,
				t.fecha,
				t.tipo,
				t.importe,
				t.categoria,
				t.descripcion,
				t.creadoEn,
				t.periodoInicio ?? null,
				t.periodoFin ?? null,
				t.soloMio ?? null,
				t.igicSoportado ?? null,
				t.numeroFactura ?? null
			]
		}],
		resultado
	};
}
function resolverTarea(foto, args) {
	const id = texto$2(args, "id");
	if (id) {
		const tarea = foto.tareas.find((t) => t.id === id);
		if (!tarea) throw new ConsultaError(`No hay ninguna tarea con id "${id}".`);
		const finca = foto.propiedades.find((p) => p.id === tarea.propiedadId);
		if (!finca) throw new ConsultaError("La tarea no tiene finca.");
		return {
			tarea,
			finca
		};
	}
	const nombre = texto$2(args, "finca");
	const titulo = texto$2(args, "titulo");
	if (!nombre || !titulo) throw new ConsultaError("Pasa \"id\", o \"finca\" y \"titulo\".");
	const finca = resolverFinca(foto.propiedades, nombre);
	const tituloNormal = normalizar(titulo);
	const candidatas = foto.tareas.filter((t) => t.propiedadId === finca.id && t.estado === "pendiente" && normalizar(t.titulo) === tituloNormal);
	if (candidatas.length === 1) return {
		tarea: candidatas[0],
		finca
	};
	if (candidatas.length === 0) throw new ConsultaError(`No hay una tarea pendiente "${titulo}" en ${finca.nombre}.`);
	throw new ConsultaError(`Hay varias tareas pendientes "${titulo}" en ${finca.nombre}. Pasa el id.`);
}
function planificar(nombre, args, foto, hoy = /* @__PURE__ */ new Date()) {
	if (!esEscritura(nombre)) throw new ConsultaError(`"${nombre}" no escribe.`);
	const datos = argsDe(args);
	const confirmar = confirmarDe(datos);
	const clave = claveDe(datos, confirmar);
	const creadoEn = hoy.toISOString();
	if (nombre === "cerrar_tarea") {
		const { tarea, finca } = resolverTarea(foto, datos);
		if (tarea.estado !== "pendiente") throw new ConsultaError("Esa tarea ya no está pendiente.");
		const vistaTarea = {
			id: tarea.id,
			finca: finca.nombre,
			titulo: tarea.titulo,
			estado: "hecha"
		};
		return {
			herramienta: nombre,
			confirmar,
			clave,
			vista: {
				escrito: false,
				vistaPrevia: true,
				tarea: vistaTarea
			},
			sentencias: [{
				sql: `update tareas set estado = 'hecha' where id = $1 and estado = 'pendiente'`,
				params: [tarea.id]
			}],
			resultado: {
				escrito: true,
				repetida: false,
				tarea: vistaTarea
			}
		};
	}
	const nombreFinca = texto$2(datos, "finca");
	if (!nombreFinca) throw new ConsultaError("Falta \"finca\".");
	const finca = resolverFinca(foto.propiedades, nombreFinca);
	if (nombre === "fijar_ficha") return ordenFicha(finca, datos.campos, confirmar, clave, hoy, foto.transacciones);
	const fecha = fechaDe(datos, hoy);
	const mes = mesDe(datos, fecha);
	const importe = euros(datos, "importe");
	const soloMio = bandera(datos, "soloMio");
	const descripcionDada = texto$2(datos, "descripcion");
	if (nombre === "registrar_cobro") {
		const categoria = texto$2(datos, "categoria") ?? "Alquiler mensual";
		if (!CATEGORIAS_INGRESO.includes(categoria)) throw new ConsultaError(`"${categoria}" no es un ingreso de la app. Usa una de: ${CATEGORIAS_INGRESO.join(", ")}.`);
		return ordenMovimiento(nombre, {
			id: randomUUID(),
			propiedadId: finca.id,
			fecha,
			tipo: "ingreso",
			importe,
			categoria,
			descripcion: descripcionDada ?? (categoria === "Alquiler mensual" ? `Alquiler ${mes}` : categoria),
			archivos: [],
			creadoEn,
			periodoInicio: categoria === "Alquiler mensual" ? `${mes}-01` : void 0,
			periodoFin: categoria === "Alquiler mensual" ? finDeMes(mes) : void 0,
			soloMio
		}, finca, confirmar, clave);
	}
	const categoria = texto$2(datos, "categoria");
	if (!categoria) throw new ConsultaError("Falta \"categoria\".");
	if (!CATEGORIAS_GASTO.includes(categoria)) throw new ConsultaError(`"${categoria}" no es un gasto de la app. Usa una de: ${CATEGORIAS_GASTO.join(", ")}.`);
	const igic = eurosOpcional(datos, "igicSoportado");
	if (igic != null && finca.tipo !== "local") throw new ConsultaError("El IGIC soportado solo se guarda en un local.");
	const explicito = periodoExplicito(datos);
	const conMes = texto$2(datos, "mes") != null;
	const numeroFactura = numeroFacturaDe(datos);
	if (numeroFactura && facturaYaRegistrada(foto.transacciones, finca.id, numeroFactura)) throw new ConsultaError(`Ya hay una factura ${numeroFactura} en ${finca.nombre}.`);
	return ordenMovimiento(nombre, {
		id: randomUUID(),
		propiedadId: finca.id,
		fecha,
		tipo: "gasto",
		importe,
		categoria,
		descripcion: descripcionDada ?? categoria,
		archivos: [],
		creadoEn,
		periodoInicio: explicito?.inicio ?? (conMes ? `${mes}-01` : void 0),
		periodoFin: explicito?.fin ?? (conMes ? finDeMes(mes) : void 0),
		numeroFactura,
		soloMio,
		igicSoportado: igic
	}, finca, confirmar, clave);
}
//#endregion
//#region scripts/mcp/env.ts
function cargarEnv() {
	const ruta = join(homedir(), ".finca-db.env");
	if (!existsSync(ruta)) return;
	for (const linea of readFileSync(ruta, "utf8").split("\n")) {
		const coincidencia = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(linea.trim());
		if (coincidencia && !process.env[coincidencia[1]]) process.env[coincidencia[1]] = coincidencia[2];
	}
}
//#endregion
//#region scripts/mcp/aplicar.ts
types.setTypeParser(1082, (valor) => valor);
types.setTypeParser(1114, (valor) => valor);
types.setTypeParser(1184, (valor) => valor);
var CREAR_TABLA = `create table if not exists agente_escrituras (
  clave text primary key,
  herramienta text not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
)`;
async function abrir() {
	cargarEnv();
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("Falta DATABASE_URL en ~/.finca-db.env");
	const cliente = new Client({
		connectionString: url,
		ssl: { rejectUnauthorized: false }
	});
	await cliente.connect();
	return cliente;
}
async function resultadoDeClave(db, clave) {
	await db.query(CREAR_TABLA);
	const guardada = (await db.query("select resultado from agente_escrituras where clave = $1", [clave])).rows[0]?.resultado;
	if (guardada && typeof guardada === "object") return guardada;
}
async function aplicarEscritura(nombre, args, deps) {
	const hoy = deps.hoy ?? /* @__PURE__ */ new Date();
	const { confirmar, clave } = intencionDe(args);
	if (!confirmar) return planificar(nombre, args, deps.foto, hoy).vista;
	const correr = async (db) => {
		if (clave) {
			const ya = await resultadoDeClave(db, clave);
			if (ya) return {
				...ya,
				repetida: true
			};
		}
		return ejecutarOrden(db, planificar(nombre, args, deps.foto, hoy));
	};
	if (deps.db) return correr(deps.db);
	const cliente = await abrir();
	try {
		return await correr(cliente);
	} finally {
		await cliente.end();
	}
}
async function ejecutarOrden(db, orden) {
	if (!orden.clave) throw new ConsultaError("Para escribir hace falta \"clave\".");
	await db.query("begin");
	try {
		await db.query(CREAR_TABLA);
		const guardada = (await db.query("select resultado from agente_escrituras where clave = $1", [orden.clave])).rows[0]?.resultado;
		if (guardada && typeof guardada === "object") {
			await db.query("commit");
			return {
				...guardada,
				repetida: true
			};
		}
		for (const sentencia of orden.sentencias) {
			const hecha = await db.query(sentencia.sql, sentencia.params);
			if (orden.herramienta === "cerrar_tarea" && (hecha.rowCount ?? 0) === 0) throw new ConsultaError("Esa tarea ya no está pendiente.");
		}
		await db.query("insert into agente_escrituras (clave, herramienta, resultado) values ($1, $2, $3::jsonb)", [
			orden.clave,
			orden.herramienta,
			JSON.stringify(orden.resultado)
		]);
		await db.query("commit");
		return orden.resultado;
	} catch (err) {
		await db.query("rollback");
		throw err;
	}
}
//#endregion
//#region scripts/mcp/protocolo.ts
var VERSION_POR_DEFECTO = "2024-11-05";
function esPeticion(mensaje) {
	return mensaje.id !== void 0 && mensaje.id !== null;
}
function versionDe(params) {
	if (params && typeof params === "object" && "protocolVersion" in params) {
		const pedida = params.protocolVersion;
		if (typeof pedida === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pedida)) return pedida;
	}
	return VERSION_POR_DEFECTO;
}
function resultado(id, result) {
	return {
		jsonrpc: "2.0",
		id,
		result
	};
}
function errorRpc(id, code, message) {
	return {
		jsonrpc: "2.0",
		id,
		error: {
			code,
			message
		}
	};
}
function texto$1(datos, esError = false) {
	return {
		content: [{
			type: "text",
			text: typeof datos === "string" ? datos : JSON.stringify(datos, null, 2)
		}],
		...esError ? { isError: true } : {}
	};
}
function fichasDe(lista) {
	return [...lista, ...fichasEscritura].map((h) => ({
		name: h.name,
		description: h.description,
		inputSchema: h.inputSchema
	}));
}
async function responder(mensaje, ctx) {
	if (!mensaje || typeof mensaje !== "object") return errorRpc(null, -32600, "Invalid Request");
	const msg = mensaje;
	const method = msg.method;
	if (!method) return esPeticion(msg) ? errorRpc(msg.id, -32600, "Invalid Request") : null;
	if (method === "initialize") {
		if (!esPeticion(msg)) return null;
		return resultado(msg.id, {
			protocolVersion: versionDe(msg.params),
			capabilities: { tools: {} },
			serverInfo: {
				name: "finca",
				version: "0.1.0"
			},
			instructions: "Lectura y escritura de Las Fincas, con las mismas cifras que la app. No devuelve DNI, email, teléfono ni NIF. La ficha añade el contrato, la fianza, los vencimientos a 60 días y el enlace de cada archivo, nunca el id suelto. Los totales y la fiscalidad cuentan solo las fincas de Jose en alquiler; un inmueble sin renta entra en el listado y en el patrimonio, no en cobros ni huecos. registrar_cobro, registrar_gasto, cerrar_tarea y fijar_ficha no guardan nada si confirmar no es true, y al guardar hace falta una clave estable para no duplicar. Un gasto puede llevar número de factura y periodo; el mismo número en la misma finca se rechaza. fijar_ficha carga la escritura (referencia, herencia, cuota) de un inmueble que ya existe."
		});
	}
	if (method === "notifications/initialized" || method === "notifications/cancelled") return null;
	if (method === "ping") return esPeticion(msg) ? resultado(msg.id, {}) : null;
	if (method === "tools/list") {
		if (!esPeticion(msg)) return null;
		return resultado(msg.id, { tools: fichasDe(herramientas) });
	}
	if (method === "tools/call") {
		if (!esPeticion(msg)) return null;
		const params = msg.params ?? {};
		if (typeof params.name !== "string") return errorRpc(msg.id, -32602, "Falta el nombre de la herramienta.");
		try {
			if (esEscritura(params.name)) {
				if (!ctx.escribir) return resultado(msg.id, texto$1("Esta sesión no puede escribir.", true));
				const datos = await ctx.escribir(params.name, params.arguments);
				return resultado(msg.id, texto$1(datos));
			}
			const foto = await ctx.foto();
			const datos = ejecutar(params.name, params.arguments, foto, ctx.hoy?.() ?? /* @__PURE__ */ new Date());
			return resultado(msg.id, texto$1(datos));
		} catch (err) {
			if (err instanceof ConsultaError) return resultado(msg.id, texto$1(err.message, true));
			throw err;
		}
	}
	if (!esPeticion(msg)) return null;
	return errorRpc(msg.id, -32601, `Method not found: ${method}`);
}
//#endregion
//#region scripts/mcp/atender.ts
var CABECERAS_CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
function json$1(status, datos) {
	return {
		status,
		contentType: "application/json; charset=utf-8",
		body: JSON.stringify(datos)
	};
}
function mensajeSeguro(err) {
	return (err instanceof Error ? err.message : "Error").replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://…").replace(/[\w.-]*supabase\.co/gi, "…");
}
function tokenValido(autorizacion, esperado) {
	if (!esperado) return false;
	const recibido = autorizacion?.startsWith("Bearer ") ? autorizacion.slice(7).trim() : "";
	const a = Buffer.from(recibido);
	const b = Buffer.from(esperado);
	if (a.length !== b.length) {
		timingSafeEqual(b, b);
		return false;
	}
	return timingSafeEqual(a, b);
}
function esRpc(body) {
	return !!body && typeof body === "object" && ("jsonrpc" in body || "method" in body);
}
async function atender(peticion, deps) {
	if (!deps.token) return json$1(503, { error: "El servidor no tiene token." });
	if (peticion.method === "OPTIONS") return {
		status: 204,
		contentType: "text/plain; charset=utf-8",
		body: ""
	};
	if (!tokenValido(peticion.authorization, deps.token)) return json$1(401, { error: "Token inválido." });
	if (peticion.method === "GET") return json$1(200, {
		lectura: true,
		escritura: true,
		herramientas: fichasDe(herramientas).map((h) => ({
			nombre: h.name,
			descripcion: h.description,
			argumentos: h.inputSchema
		}))
	});
	if (peticion.method !== "POST") return json$1(405, { error: "Usa GET o POST." });
	const body = peticion.body;
	if (body && typeof body === "object" && "herramienta" in body && !esRpc(body)) {
		const nombre = body.herramienta;
		const argumentos = body.argumentos;
		if (typeof nombre !== "string") return json$1(400, { error: "\"herramienta\" tiene que ser texto." });
		try {
			const hoy = deps.hoy?.() ?? /* @__PURE__ */ new Date();
			const foto = await deps.foto();
			if (esEscritura(nombre)) return json$1(200, await aplicarEscritura(nombre, argumentos, {
				foto,
				hoy
			}));
			return json$1(200, ejecutar(nombre, argumentos, foto, hoy));
		} catch (err) {
			if (err instanceof ConsultaError) return json$1(400, { error: err.message });
			return json$1(500, { error: mensajeSeguro(err) });
		}
	}
	try {
		const rpc = await responder(body, {
			foto: deps.foto,
			hoy: deps.hoy,
			escribir: async (nombre, argumentos) => {
				return aplicarEscritura(nombre, argumentos, {
					foto: await deps.foto(),
					hoy: deps.hoy?.() ?? /* @__PURE__ */ new Date()
				});
			}
		});
		if (rpc == null) return {
			status: 202,
			contentType: "application/json; charset=utf-8",
			body: ""
		};
		return json$1(200, rpc);
	} catch (err) {
		return json$1(200, {
			jsonrpc: "2.0",
			id: body && typeof body === "object" && "id" in body ? body.id ?? null : null,
			error: {
				code: -32603,
				message: mensajeSeguro(err)
			}
		});
	}
}
//#endregion
//#region scripts/mcp/filas.ts
function texto(fila, clave) {
	const valor = fila[clave];
	if (valor == null) return void 0;
	if (valor instanceof Date) return valor.toISOString();
	return String(valor);
}
function dia(fila, clave) {
	const valor = texto(fila, clave);
	return valor ? valor.slice(0, 10) : void 0;
}
function numero(fila, clave) {
	const valor = fila[clave];
	if (valor == null || valor === "") return void 0;
	const n = Number(valor);
	return Number.isFinite(n) ? n : void 0;
}
function json(fila, clave) {
	const valor = fila[clave];
	if (valor == null) return void 0;
	return valor;
}
function cuotaDeFila(fila) {
	const numerador = numero(fila, "cuota_numerador");
	const denominador = numero(fila, "cuota_denominador");
	if (numerador == null || denominador == null || denominador <= 0) return void 0;
	return {
		numerador,
		denominador,
		valor: numero(fila, "cuota_valor") ?? numerador / denominador
	};
}
function filaAPropiedad(fila) {
	return {
		id: texto(fila, "id") ?? "",
		nombre: texto(fila, "nombre") ?? "",
		direccion: texto(fila, "direccion") ?? "",
		tipo: texto(fila, "tipo") ?? "otro",
		estado: texto(fila, "estado") ?? "vacio",
		folderId: texto(fila, "folder_id") ?? "",
		creadoEn: texto(fila, "creado_en") ?? "",
		inquilinoNombre: texto(fila, "inquilino_nombre"),
		inquilinoEmail: texto(fila, "inquilino_email"),
		inquilinoTelefono: texto(fila, "inquilino_telefono"),
		inquilinoDni: texto(fila, "inquilino_dni"),
		alquilerMensual: numero(fila, "alquiler_mensual"),
		contratoInicio: dia(fila, "contrato_inicio"),
		contratoFin: dia(fila, "contrato_fin"),
		notas: texto(fila, "notas"),
		contratoArchivoId: texto(fila, "contrato_archivo_id"),
		contratoArchivoNombre: texto(fila, "contrato_archivo_nombre"),
		reparto: json(fila, "reparto"),
		historialContratos: json(fila, "historial_contratos"),
		tramosContrato: json(fila, "tramos_contrato"),
		porcentajePropiedad: numero(fila, "porcentaje_propiedad"),
		gastosRecurrentes: json(fila, "gastos_recurrentes"),
		conceptosFijos: json(fila, "conceptos_fijos"),
		referenciaCatastral: texto(fila, "referencia_catastral"),
		valorAdquisicion: numero(fila, "valor_adquisicion"),
		fechaAdquisicion: dia(fila, "fecha_adquisicion"),
		tipoAdquisicion: texto(fila, "tipo_adquisicion"),
		metrosCuadrados: numero(fila, "metros_cuadrados"),
		fechaValorMercado: dia(fila, "fecha_valor_mercado"),
		cuotaPropiedad: cuotaDeFila(fila),
		sinRenta: fila.sin_renta == null ? void 0 : Boolean(fila.sin_renta),
		financiacion: json(fila, "financiacion"),
		copropietarios: json(fila, "copropietarios"),
		municipio: texto(fila, "municipio"),
		valorReferencia: numero(fila, "valor_referencia"),
		valorMercado: numero(fila, "valor_mercado"),
		propietarioNombre: texto(fila, "propietario_nombre"),
		alDiaDesde: texto(fila, "al_dia_desde"),
		contratoLuzNumero: texto(fila, "contrato_luz_numero"),
		contratoLuzEmpresa: texto(fila, "contrato_luz_empresa"),
		contratoAguaNumero: texto(fila, "contrato_agua_numero"),
		contratoAguaEmpresa: texto(fila, "contrato_agua_empresa"),
		deudaDesde: texto(fila, "deuda_desde"),
		rentaRevisadaDesde: texto(fila, "renta_revisada_desde"),
		valorConstruccion: numero(fila, "valor_construccion"),
		certificadoEnergeticoVencimiento: dia(fila, "certificado_energetico_vencimiento"),
		fianzaImporte: numero(fila, "fianza_importe"),
		fianzaDepositadaDesde: texto(fila, "fianza_depositada_desde"),
		diaCobro: numero(fila, "dia_cobro"),
		fianzaDepositoNumero: texto(fila, "fianza_deposito_numero"),
		fianzaDepositoArchivoId: texto(fila, "fianza_deposito_archivo_id"),
		fianzaDepositoArchivoNombre: texto(fila, "fianza_deposito_archivo_nombre"),
		seguroVencimiento: dia(fila, "seguro_vencimiento"),
		ibiMes: numero(fila, "ibi_mes"),
		huecosMensualesOmitidos: json(fila, "huecos_mensuales_omitidos")
	};
}
function filaATransaccion(fila) {
	return {
		id: texto(fila, "id") ?? "",
		propiedadId: texto(fila, "propiedad_id") ?? "",
		fecha: dia(fila, "fecha") ?? "",
		tipo: texto(fila, "tipo") ?? "gasto",
		importe: numero(fila, "importe") ?? 0,
		categoria: texto(fila, "categoria") ?? "",
		descripcion: texto(fila, "descripcion") ?? "",
		archivos: json(fila, "archivos") ?? [],
		creadoEn: texto(fila, "creado_en") ?? "",
		referencia: texto(fila, "referencia"),
		numeroFactura: texto(fila, "numero_factura"),
		periodoInicio: dia(fila, "periodo_inicio"),
		periodoFin: dia(fila, "periodo_fin"),
		soloMio: fila.solo_mio == null ? void 0 : Boolean(fila.solo_mio),
		igicSoportado: numero(fila, "igic_soportado"),
		gastoRecurrenteId: texto(fila, "gasto_recurrente_id")
	};
}
function filaATarea(fila) {
	return {
		id: texto(fila, "id") ?? "",
		propiedadId: texto(fila, "propiedad_id") ?? "",
		titulo: texto(fila, "titulo") ?? "",
		descripcion: texto(fila, "descripcion"),
		prioridad: texto(fila, "prioridad") ?? "media",
		fechaLimite: dia(fila, "fecha_limite"),
		estado: texto(fila, "estado") ?? "pendiente",
		creadoEn: texto(fila, "creado_en") ?? ""
	};
}
function filaAIngresoExterno(fila) {
	return {
		id: texto(fila, "id") ?? "",
		nombre: texto(fila, "nombre") ?? "",
		importeAnual: numero(fila, "importe_anual") ?? 0,
		porcentajeRetencion: numero(fila, "porcentaje_retencion") ?? 0,
		creadoEn: texto(fila, "creado_en") ?? ""
	};
}
//#endregion
//#region scripts/mcp/foto.ts
types.setTypeParser(1082, (valor) => valor);
types.setTypeParser(1114, (valor) => valor);
types.setTypeParser(1184, (valor) => valor);
async function cargarFoto() {
	cargarEnv();
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("Falta DATABASE_URL en ~/.finca-db.env");
	const cliente = new Client({
		connectionString: url,
		ssl: { rejectUnauthorized: false }
	});
	await cliente.connect();
	try {
		const propiedades = await cliente.query("select * from propiedades");
		const transacciones = await cliente.query("select * from transacciones");
		const tareas = await cliente.query("select * from tareas");
		const ingresos = await cliente.query("select * from ingresos_externos");
		return {
			propiedades: propiedades.rows.map((fila) => filaAPropiedad(fila)),
			transacciones: transacciones.rows.map((fila) => filaATransaccion(fila)),
			tareas: tareas.rows.map((fila) => filaATarea(fila)),
			ingresosExternos: ingresos.rows.map((fila) => filaAIngresoExterno(fila))
		};
	} finally {
		await cliente.end();
	}
}
//#endregion
//#region scripts/mcp/funcion.ts
async function leerCuerpo(req) {
	const ya = req.body;
	if (ya != null && ya !== "") {
		if (typeof ya === "string") return ya.trim() ? JSON.parse(ya) : void 0;
		if (Buffer.isBuffer(ya)) {
			const raw = ya.toString("utf8").trim();
			return raw ? JSON.parse(raw) : void 0;
		}
		return ya;
	}
	const trozos = [];
	for await (const trozo of req) trozos.push(typeof trozo === "string" ? Buffer.from(trozo) : trozo);
	const raw = Buffer.concat(trozos).toString("utf8").trim();
	if (!raw) return void 0;
	return JSON.parse(raw);
}
async function handler(req, res) {
	try {
		const body = req.method === "POST" ? await leerCuerpo(req) : void 0;
		const autorizacion = req.headers.authorization;
		const respuesta = await atender({
			method: req.method ?? "GET",
			authorization: Array.isArray(autorizacion) ? autorizacion[0] : autorizacion,
			body
		}, {
			token: process.env.FINCA_MCP_TOKEN ?? "",
			foto: cargarFoto
		});
		res.writeHead(respuesta.status, {
			...CABECERAS_CORS,
			"Content-Type": respuesta.contentType
		});
		res.end(respuesta.body);
	} catch {
		res.writeHead(400, {
			...CABECERAS_CORS,
			"Content-Type": "application/json; charset=utf-8"
		});
		res.end(JSON.stringify({ error: "La petición no es JSON válido." }));
	}
}
//#endregion
export { handler as default };
