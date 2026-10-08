// =====================================================================
//  LECTOR DE EXTRACTOS BANCARIOS
//  Convierte el texto del PDF en movimientos, controla el saldo fila
//  por fila y clasifica cada movimiento según reglas.js
// =====================================================================

const NUM = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?";
const RX = {
  movimiento: new RegExp(`^(\\d{2}/\\d{2}/\\d{2,4})\\s+(.+?)\\s+(${NUM})\\s+(${NUM})$`),
  saldoAnterior: new RegExp(`^SALDO ANTERIOR\\s+(${NUM})$`),
  saldoFinal: new RegExp(`^SALDO FINAL\\s+(${NUM})$`),
  transporte: new RegExp(`^TRANSPORTE\\s+(${NUM})$`),
  periodo: /PERIODO:\s*(\d{2}\/\d{2}\/\d{4})\s+AL\s+(\d{2}\/\d{2}\/\d{4})/,
  tipoCuenta: /^(CUENTA CORRIENTE|CAJA DE AHORROS?)\b.*$/,
  totalBanco: /^TOTAL\s+(.+?)\s+\$\s*([\d.]+,\d{2})$/,
  empiezaConFecha: /^\d{2}\/\d{2}\/\d{2,4}\s/,
};

// "1.253.007,29-" -> -125300729 (centavos, para no perder precisión)
function aCentavos(txt) {
  const neg = txt.endsWith("-") || txt.startsWith("-");
  const limpio = txt.replace(/-/g, "").replace(/\./g, "").replace(",", "");
  const n = parseInt(limpio, 10);
  return neg ? -n : n;
}

// Agrupa los fragmentos de texto de pdf.js en líneas (misma altura)
function itemsALineas(items) {
  const frags = items
    .filter((it) => it.str && it.str.trim() !== "" && !/^[_\-\s]+$/.test(it.str)) // descarta marcas de margen "____"
    .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }));
  frags.sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas = [];
  for (const f of frags) {
    const ult = lineas[lineas.length - 1];
    if (ult && Math.abs(ult.y - f.y) < 2) ult.partes.push(f);
    else lineas.push({ y: f.y, partes: [f] });
  }
  return lineas.map((l) =>
    l.partes.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim()
  );
}

function clasificar(descripcion, tipo, reglas) {
  const d = descripcion.toUpperCase();
  for (const r of reglas) {
    if (r.tipo && r.tipo !== tipo) continue;
    if (r.contiene.every((t) => d.includes(t.toUpperCase()))) return r.imputacion;
  }
  return "Sin clasificar";
}

function fechaISO(ddmmyy) {
  const [d, m, y] = ddmmyy.split("/");
  const anio = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
  return { anio, mes: parseInt(m, 10), dia: parseInt(d, 10) };
}

// Clave para identificar los totales que informa el banco al pie
function claveTotal(texto) {
  const t = texto.toUpperCase();
  if (t.includes("25413") && t.includes("CREDITOS")) return "ley25413Cred";
  if (t.includes("25413") && t.includes("DEBITOS")) return "ley25413Deb";
  if (t.includes("IBTC")) return "ibtc";
  if (t.includes("SIRCREB")) return "sircreb";
  return null;
}

// lineas: array de strings (todas las páginas de UN archivo, en orden)
function procesarLineas(lineas, fuente, reglas) {
  const tramos = [];
  const lineasSinLeer = [];
  let periodo = null;
  let tipoCuenta = "Cuenta";
  let actual = null;
  let saldoPrev = null;

  const nuevoTramo = (saldoAnterior) => {
    actual = {
      fuente, periodo, cuenta: tipoCuenta, saldoAnterior,
      saldoFinalBanco: null, movimientos: [], totalesBanco: {}, avisos: [],
    };
    tramos.push(actual);
    saldoPrev = saldoAnterior;
  };

  for (const lineaOriginal of lineas) {
    // Si quedó basura delante de la fecha, se descarta lo previo a la fecha
    const posFecha = lineaOriginal.search(/\d{2}\/\d{2}\/\d{2,4}\s/);
    const linea = posFecha > 0 && /^[^0-9A-Z]*$/i.test(lineaOriginal.slice(0, posFecha))
      ? lineaOriginal.slice(posFecha) : lineaOriginal;
    let m;
    if ((m = linea.match(RX.periodo))) { periodo = `${m[1]} al ${m[2]}`; continue; }
    if ((m = linea.match(RX.tipoCuenta))) { tipoCuenta = linea.replace(/\s+/g, " "); continue; }
    if ((m = linea.match(RX.saldoAnterior))) { nuevoTramo(aCentavos(m[1])); continue; }

    if ((m = linea.match(RX.transporte))) {
      if (actual && saldoPrev !== null && aCentavos(m[1]) !== saldoPrev)
        actual.avisos.push(`El TRANSPORTE ${m[1]} no coincide con el saldo acumulado.`);
      continue;
    }
    if ((m = linea.match(RX.saldoFinal))) {
      if (actual) actual.saldoFinalBanco = aCentavos(m[1]);
      continue;
    }
    if ((m = linea.match(RX.totalBanco))) {
      const k = claveTotal(m[1]);
      if (k && actual) actual.totalesBanco[k] = aCentavos(m[2]);
      continue;
    }

    if ((m = linea.match(RX.movimiento))) {
      if (!actual) nuevoTramo(null);
      const [, fecha, medio, txtImporte, txtSaldo] = m;
      const importe = Math.abs(aCentavos(txtImporte));
      const saldo = aCentavos(txtSaldo);

      // Separa el comprobante (último número de la descripción)
      const partes = medio.split(" ");
      let comprobante = "";
      if (partes.length > 1 && /^\d+$/.test(partes[partes.length - 1])) comprobante = partes.pop();
      const descripcion = partes.join(" ");

      // Débito o crédito: lo decide el saldo
      let tipo = null, control = "OK";
      if (saldoPrev === null) {
        control = "Sin saldo anterior";
      } else if (saldo - saldoPrev === importe) {
        tipo = "Credito";
      } else if (saldoPrev - saldo === importe) {
        tipo = "Debito";
      } else {
        control = "REVISAR: el saldo no cierra";
        tipo = saldo >= saldoPrev ? "Credito" : "Debito"; // estimado por el sentido del saldo
      }
      saldoPrev = saldo; // se resincroniza para que un error no arrastre a los demás

      const imputacion = tipo ? clasificar(descripcion, tipo, reglas) : "Sin clasificar";
      if (control === "OK" && imputacion === "Sin clasificar") control = "Sin regla";

      actual.movimientos.push({
        fecha: fechaISO(fecha), fechaTxt: fecha, descripcion, comprobante,
        tipo: tipo || "?", importe: tipo === "Debito" ? -importe : importe,
        saldo, imputacion, control, cuenta: actual.cuenta, fuente,
      });
      continue;
    }

    // Una línea que empieza con fecha y no se pudo leer es sospechosa
    if (RX.empiezaConFecha.test(linea)) lineasSinLeer.push(linea);
  }

  // Controles de cierre de cada tramo
  for (const t of tramos) {
    const cred = t.movimientos.filter((x) => x.importe > 0).reduce((a, x) => a + x.importe, 0);
    const deb = t.movimientos.filter((x) => x.importe < 0).reduce((a, x) => a - x.importe, 0);
    t.creditos = cred;
    t.debitos = deb;
    t.saldoFinalCalculado = t.saldoAnterior === null ? null : t.saldoAnterior + cred - deb;
    t.filasRevisar = t.movimientos.filter((x) => x.control.startsWith("REVISAR")).length;

    const sumaDesc = (fn) => t.movimientos.filter((x) => fn(x.descripcion)).reduce((a, x) => a - x.importe, 0);
    t.totalesCalculados = {
      ley25413Cred: sumaDesc((d) => /25413/.test(d) && /CRED/.test(d)),
      ley25413Deb: sumaDesc((d) => /25413/.test(d) && /DEB/.test(d)),
      ibtc: sumaDesc((d) => /IBTC/.test(d)),
      sircreb: sumaDesc((d) => /SIRCREB/.test(d)),
    };
    t.cuadra =
      t.saldoFinalBanco !== null && t.saldoFinalCalculado === t.saldoFinalBanco &&
      t.filasRevisar === 0 && t.avisos.length === 0;
  }

  return { tramos, lineasSinLeer };
}

if (typeof module !== "undefined") module.exports = { itemsALineas, procesarLineas, aCentavos, clasificar };
