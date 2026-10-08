// =====================================================================
//  APP: carga de PDFs, vista previa y armado del Excel
// =====================================================================

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesos = (centavos) => (centavos === null || centavos === undefined ? "—" : fmt.format(centavos / 100));
const mesDe = (f) => `${f.anio}-${String(f.mes).padStart(2, "0")}`;

let datos = null; // { tramos, movimientos, lineasSinLeer }

// ---------------------------------------------------------------- carga
const zona = $("zona");
$("archivos").addEventListener("change", (e) => procesarArchivos([...e.target.files]));
["dragover", "dragenter"].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("encima"); })
);
["dragleave", "drop"].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove("encima"); })
);
zona.addEventListener("drop", (e) =>
  procesarArchivos([...e.dataTransfer.files].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)))
);

function estado(texto, error = false) {
  $("estado").textContent = texto;
  $("estado").classList.toggle("error", error);
}

async function leerLineasPDF(archivo) {
  // isEvalSupported: false cierra una vulnerabilidad conocida de pdf.js (CVE-2024-4367)
  const doc = await pdfjsLib.getDocument({ data: await archivo.arrayBuffer(), isEvalSupported: false }).promise;
  const lineas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    const contenido = await pagina.getTextContent();
    lineas.push(...itemsALineas(contenido.items));
  }
  return { lineas, paginas: doc.numPages };
}

async function procesarArchivos(archivos) {
  if (!archivos.length) return;
  if (!window.pdfjsLib) return estado("No se pudo cargar el lector de PDF. Revisá la conexión a internet y recargá la página.", true);

  const tramos = [];
  const lineasSinLeer = [];
  const problemas = [];

  for (const [i, archivo] of archivos.entries()) {
    estado(`Leyendo ${archivo.name} (${i + 1} de ${archivos.length})…`);
    try {
      const { lineas, paginas } = await leerLineasPDF(archivo);
      const r = procesarLineas(lineas, archivo.name, REGLAS);
      const cantidad = r.tramos.reduce((a, t) => a + t.movimientos.length, 0);
      if (cantidad === 0) {
        problemas.push(
          lineas.length < paginas * 3
            ? `${archivo.name}: no tiene texto, es una imagen. Usá el PDF original descargado del home banking (no uno escaneado, unido con iLovePDF o impreso como PDF).`
            : `${archivo.name}: tiene texto pero no se encontraron movimientos con el formato esperado.`
        );
        continue;
      }
      tramos.push(...r.tramos);
      lineasSinLeer.push(...r.lineasSinLeer.map((l) => `${archivo.name}: ${l}`));
    } catch (err) {
      problemas.push(`${archivo.name}: no se pudo abrir (${err.message}).`);
    }
  }

  if (!tramos.length) {
    $("resultados").hidden = true;
    return estado(problemas.join(" "), true);
  }

  // Orden cronológico por la fecha del primer movimiento
  const clave = (t) => { const f = t.movimientos[0]?.fecha; return f ? f.anio * 10000 + f.mes * 100 + f.dia : 0; };
  tramos.sort((a, b) => clave(a) - clave(b));

  // Aviso de períodos repetidos (mismo extracto subido dos veces)
  const vistos = new Set();
  for (const t of tramos) {
    const k = `${t.cuenta}|${t.periodo}|${t.saldoAnterior}`;
    if (vistos.has(k)) t.avisos.push("Este período aparece repetido: puede que hayas subido el mismo extracto dos veces.");
    vistos.add(k);
  }

  datos = { tramos, movimientos: tramos.flatMap((t) => t.movimientos), lineasSinLeer };
  const malos = tramos.filter((t) => !t.cuadra).length;
  estado(
    problemas.join(" ") ||
      `${datos.movimientos.length} movimientos leídos de ${archivos.length} archivo(s). ` +
      (malos ? `${malos} extracto(s) con diferencias: revisalos abajo.` : "Todos los extractos cuadran."),
    problemas.length > 0
  );
  mostrar();
}

// ---------------------------------------------------------------- vista
function mostrar() {
  $("resultados").hidden = false;
  mostrarControles();
  mostrarResumen();
  prepararFiltros();
  mostrarMovimientos();
}

function mostrarControles() {
  const cont = $("controles");
  cont.innerHTML = "";
  for (const t of datos.tramos) {
    const nombres = { ley25413Cred: "Ley 25413 créditos", ley25413Deb: "Ley 25413 débitos", sircreb: "SIRCREB", ibtc: "IBTC" };
    const errores = [...t.avisos];
    if (t.saldoFinalBanco === null) errores.push("No se encontró el SALDO FINAL en el PDF.");
    else if (t.saldoFinalCalculado !== t.saldoFinalBanco)
      errores.push(`Saldo final calculado ${pesos(t.saldoFinalCalculado)} vs. banco ${pesos(t.saldoFinalBanco)}.`);
    if (t.filasRevisar) errores.push(`${t.filasRevisar} renglón(es) donde el saldo no cierra: aparecen en rojo en la tabla.`);
    for (const k in t.totalesBanco)
      if (t.totalesBanco[k] !== t.totalesCalculados[k])
        errores.push(`${nombres[k]}: banco ${pesos(t.totalesBanco[k])}, leído ${pesos(t.totalesCalculados[k])}.`);

    const verificados = Object.keys(t.totalesBanco).map((k) => nombres[k]).join(", ");
    const div = document.createElement("div");
    div.className = "control" + (errores.length ? " mal" : "");
    div.innerHTML = `
      <span class="sello">${errores.length ? "No cuadra" : "Cuadra"}</span>
      <div class="que">${esc(t.cuenta)}, ${esc(t.periodo || "período sin identificar")} <span class="nota">(${esc(t.fuente)})</span></div>
      <div class="datos">
        <span>Saldo anterior <b>${pesos(t.saldoAnterior)}</b></span>
        <span>Créditos <b>${pesos(t.creditos)}</b></span>
        <span>Débitos <b>${pesos(t.debitos)}</b></span>
        <span>Saldo final <b>${pesos(t.saldoFinalBanco)}</b></span>
        <span>Movimientos <b>${t.movimientos.length}</b></span>
        ${verificados && !errores.length ? `<span>Totales del banco verificados: ${esc(verificados)}</span>` : ""}
      </div>
      ${errores.length ? `<ul>${errores.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}`;
    cont.appendChild(div);
  }
  if (datos.lineasSinLeer.length) {
    const div = document.createElement("div");
    div.className = "control mal";
    div.innerHTML = `<span class="sello">Atención</span><div class="que">Renglones con fecha que no se pudieron leer</div>
      <ul>${datos.lineasSinLeer.slice(0, 20).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    cont.appendChild(div);
  }
}

function agrupar(movs, claveFn) {
  const m = new Map();
  for (const x of movs) {
    const k = claveFn(x);
    const v = m.get(k) || { cred: 0, deb: 0, n: 0 };
    if (x.importe > 0) v.cred += x.importe; else v.deb -= x.importe;
    v.n++;
    m.set(k, v);
  }
  return m;
}

function mostrarResumen() {
  const g = [...agrupar(datos.movimientos, (x) => x.imputacion)].sort((a, b) => b[1].cred + b[1].deb - (a[1].cred + a[1].deb));
  let tc = 0, td = 0;
  let html = `<thead><tr><th>Imputación</th><th class="n">Cant.</th><th class="n">Créditos</th><th class="n">Débitos</th></tr></thead><tbody>`;
  for (const [k, v] of g) {
    tc += v.cred; td += v.deb;
    html += `<tr><td>${esc(k)}</td><td class="n">${v.n}</td><td class="n">${v.cred ? pesos(v.cred) : ""}</td><td class="n">${v.deb ? pesos(v.deb) : ""}</td></tr>`;
  }
  html += `<tr class="total"><td>Total</td><td class="n">${datos.movimientos.length}</td><td class="n">${pesos(tc)}</td><td class="n">${pesos(td)}</td></tr></tbody>`;
  $("tabla-imputacion").innerHTML = html;

  const meses = [...new Set(datos.movimientos.map((x) => mesDe(x.fecha)))].sort();
  let h = `<thead><tr><th>Concepto</th>${meses.map((m) => `<th class="n">${m}</th>`).join("")}</tr></thead><tbody>`;
  for (const [titulo, imput] of IMPUESTOS) {
    h += `<tr><td>${titulo}</td>${meses.map((m) => `<td class="n">${pesos(netoImpuesto(datos.movimientos, imput, m))}</td>`).join("")}</tr>`;
  }
  $("tabla-impuestos").innerHTML = h + "</tbody>";
}

// [título, imputación]
const IMPUESTOS = [
  ["Ley 25413 s/créditos", "Impuesto al credito"],
  ["Ley 25413 s/débitos", "Impuesto al debito"],
  ["SIRCREB (ret. IIBB)", "Sircreb"],
  ["IVA s/gastos bancarios", "IVA"],
  ["Percepción IVA RG 2408", "Percep IVA"],
  ["Gravamen IBTC", "Gravamen IBTC"],
];
const netoImpuesto = (movs, imput, mes) =>
  -movs.filter((x) => x.imputacion === imput && mesDe(x.fecha) === mes).reduce((a, x) => a + x.importe, 0);

function prepararFiltros() {
  const opciones = (id, valores) => {
    $(id).innerHTML = `<option value="">Todos</option>` + valores.map((v) => `<option>${esc(v)}</option>`).join("");
    $(id).onchange = mostrarMovimientos;
  };
  const unicos = (fn) => [...new Set(datos.movimientos.map(fn))].sort();
  opciones("f-imputacion", unicos((x) => x.imputacion));
  opciones("f-tipo", unicos((x) => x.tipo));
  opciones("f-mes", unicos((x) => mesDe(x.fecha)));
  opciones("f-control", unicos((x) => x.control));
}

function mostrarMovimientos() {
  const fi = $("f-imputacion").value, ft = $("f-tipo").value, fm = $("f-mes").value, fc = $("f-control").value;
  const lista = datos.movimientos.filter(
    (x) => (!fi || x.imputacion === fi) && (!ft || x.tipo === ft) && (!fm || mesDe(x.fecha) === fm) && (!fc || x.control === fc)
  );
  const total = lista.reduce((a, x) => a + x.importe, 0);
  $("total-filtro").textContent = `${lista.length} movimientos, total ${pesos(total)}`;

  const MAX = 800;
  let html = `<thead><tr><th>Fecha</th><th>Descripción</th><th>Comprob.</th><th>Tipo</th><th>Imputación</th><th class="n">Importe</th><th class="n">Saldo</th><th>Control</th></tr></thead><tbody>`;
  for (const x of lista.slice(0, MAX)) {
    const cls = x.control.startsWith("REVISAR") ? "revisar" : x.control === "Sin regla" ? "sinregla" : "";
    html += `<tr class="${cls}"><td>${x.fechaTxt}</td><td>${esc(x.descripcion)}</td><td>${x.comprobante}</td><td>${x.tipo}</td><td>${esc(x.imputacion)}</td>
      <td class="n ${x.importe < 0 ? "neg" : ""}">${pesos(x.importe)}</td><td class="n">${pesos(x.saldo)}</td><td>${esc(x.control)}</td></tr>`;
  }
  $("tabla-movimientos").innerHTML = html + "</tbody>";
  $("nota-movimientos").textContent =
    lista.length > MAX ? `Se muestran los primeros ${MAX}. El Excel tiene todos.` : "";
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------------------------------------------------------------- Excel
$("descargar").addEventListener("click", () => {
  if (!datos) return;
  try {
    const wb = armarExcel(datos);
    const meses = [...new Set(datos.movimientos.map((x) => mesDe(x.fecha)))].sort();
    const nombre = meses.length > 1 ? `Extractos ${meses[0]} a ${meses[meses.length - 1]}.xlsx` : `Extracto ${meses[0]}.xlsx`;
    XLSX.writeFile(wb, nombre);
  } catch (err) {
    estado(`No se pudo generar el Excel: ${err.message}`, true);
  }
});

const FORMATO = "#,##0.00;-#,##0.00;\"\"";
const serialExcel = (f) => (Date.UTC(f.anio, f.mes - 1, f.dia) - Date.UTC(1899, 11, 30)) / 86400000;

function nuevaHoja() { return { _max: { r: 0, c: 0 } }; }
function poner(ws, r, c, valor, extra = {}) {
  if (valor === null || valor === undefined || valor === "") return; // celda vacía de verdad
  let celda;
  if (typeof valor === "number") celda = { t: "n", v: valor };
  else celda = { t: "s", v: String(valor) };
  Object.assign(celda, extra);
  ws[XLSX.utils.encode_cell({ r, c })] = celda;
  ws._max.r = Math.max(ws._max.r, r);
  ws._max.c = Math.max(ws._max.c, c);
}
function cerrarHoja(ws, anchos) {
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: ws._max });
  ws["!cols"] = anchos.map((w) => ({ wch: w }));
  delete ws._max;
  return ws;
}
const pesosXL = (c) => (c === null || c === undefined ? null : Math.round(c) / 100);

function armarExcel({ tramos, movimientos }) {
  const wb = XLSX.utils.book_new();
  const n = movimientos.length;
  const ini = 3, fin = ini + n - 1;            // filas de datos en Excel (1-based)
  const rango = (col) => `Movimientos!$${col}$${ini}:$${col}$${fin}`;

  // ---------------- Hoja Movimientos
  const ws = nuevaHoja();
  const enc = ["Fecha", "Mes", "Descripción", "Comprobante", "Tipo", "Imputación", "Importe", "Débito", "Crédito", "Saldo", "Control", "Cuenta", "Fuente"];
  const vis = (col) => movimientos.reduce((a, x) => a + (col === "G" ? x.importe : col === "H" ? (x.importe < 0 ? -x.importe : 0) : (x.importe > 0 ? x.importe : 0)), 0);
  poner(ws, 0, 5, "Total visible (según filtro):");
  for (const [c, col] of [[6, "G"], [7, "H"], [8, "I"]])
    poner(ws, 0, c, pesosXL(vis(col)), { f: `SUBTOTAL(9,${col}${ini}:${col}${fin})`, z: FORMATO });
  enc.forEach((h, c) => poner(ws, 1, c, h));
  movimientos.forEach((x, i) => {
    const r = i + 2;
    poner(ws, r, 0, serialExcel(x.fecha), { z: "dd/mm/yyyy" });
    poner(ws, r, 1, mesDe(x.fecha));
    poner(ws, r, 2, x.descripcion);
    poner(ws, r, 3, x.comprobante);
    poner(ws, r, 4, x.tipo);
    poner(ws, r, 5, x.imputacion);
    poner(ws, r, 6, pesosXL(x.importe), { z: FORMATO });
    poner(ws, r, 7, x.importe < 0 ? pesosXL(-x.importe) : null, { z: FORMATO });
    poner(ws, r, 8, x.importe > 0 ? pesosXL(x.importe) : null, { z: FORMATO });
    poner(ws, r, 9, pesosXL(x.saldo), { z: FORMATO });
    poner(ws, r, 10, x.control);
    poner(ws, r, 11, x.cuenta);
    poner(ws, r, 12, x.fuente);
  });
  cerrarHoja(ws, [11, 9, 32, 13, 9, 22, 16, 16, 16, 17, 24, 26, 30]);
  ws["!autofilter"] = { ref: `A2:M${fin}` };
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");

  // ---------------- Hoja Resumen (fórmulas: se actualiza si cambiás imputaciones)
  const meses = [...new Set(movimientos.map((x) => mesDe(x.fecha)))].sort();
  const rs = nuevaHoja();
  const colL = (c) => XLSX.utils.encode_col(c);
  let r = 0;
  poner(rs, r++, 0, "Resumen por imputación y mes. Se recalcula si modificás la columna Imputación en Movimientos.");
  r++;
  for (const [titulo, signo, colSuma] of [["Créditos", 1, "I"], ["Débitos", -1, "H"]]) {
    poner(rs, r, 0, titulo);
    meses.forEach((m, j) => poner(rs, r, j + 1, m));
    poner(rs, r, meses.length + 1, "Total");
    const filaEnc = r++;
    const imputs = [...new Set(movimientos.filter((x) => Math.sign(x.importe) === signo).map((x) => x.imputacion))].sort();
    const primera = r;
    for (const imp of imputs) {
      poner(rs, r, 0, imp);
      meses.forEach((m, j) => {
        const v = movimientos.filter((x) => x.imputacion === imp && mesDe(x.fecha) === m && Math.sign(x.importe) === signo)
          .reduce((a, x) => a + Math.abs(x.importe), 0);
        poner(rs, r, j + 1, pesosXL(v), {
          z: FORMATO,
          f: `SUMIFS(${rango(colSuma)},${rango("F")},$A${r + 1},${rango("B")},${colL(j + 1)}$${filaEnc + 1})`,
        });
      });
      const vt = movimientos.filter((x) => x.imputacion === imp && Math.sign(x.importe) === signo).reduce((a, x) => a + Math.abs(x.importe), 0);
      poner(rs, r, meses.length + 1, pesosXL(vt), { z: FORMATO, f: `SUM(B${r + 1}:${colL(meses.length)}${r + 1})` });
      r++;
    }
    poner(rs, r, 0, `Total ${titulo.toLowerCase()}`);
    for (let j = 1; j <= meses.length + 1; j++) {
      const v = movimientos.filter((x) => Math.sign(x.importe) === signo && (j > meses.length || mesDe(x.fecha) === meses[j - 1]))
        .reduce((a, x) => a + Math.abs(x.importe), 0);
      poner(rs, r, j, pesosXL(v), { z: FORMATO, f: `SUM(${colL(j)}${primera + 1}:${colL(j)}${r})` });
    }
    r += 3;
  }
  XLSX.utils.book_append_sheet(wb, cerrarHoja(rs, [26, ...meses.map(() => 16), 18]), "Resumen");

  // ---------------- Hoja Impuestos
  const is = nuevaHoja();
  poner(is, 0, 0, "Importes netos de reintegros, para cotejar con las declaraciones juradas.");
  poner(is, 2, 0, "Mes");
  IMPUESTOS.forEach(([t], j) => poner(is, 2, j + 1, t));
  poner(is, 2, IMPUESTOS.length + 1, "Total Ley 25413");
  meses.forEach((m, i) => {
    const fila = i + 3;
    poner(is, fila, 0, m);
    IMPUESTOS.forEach(([, imp], j) =>
      poner(is, fila, j + 1, pesosXL(netoImpuesto(movimientos, imp, m)), {
        z: FORMATO, f: `-SUMIFS(${rango("G")},${rango("F")},"${imp}",${rango("B")},$A${fila + 1})`,
      })
    );
    const ley = netoImpuesto(movimientos, "Impuesto al credito", m) + netoImpuesto(movimientos, "Impuesto al debito", m);
    poner(is, fila, IMPUESTOS.length + 1, pesosXL(ley), { z: FORMATO, f: `B${fila + 1}+C${fila + 1}` });
  });
  const ft = meses.length + 3;
  poner(is, ft, 0, "Total");
  for (let j = 1; j <= IMPUESTOS.length + 1; j++) {
    const col = colL(j);
    let v = 0;
    if (j <= IMPUESTOS.length) meses.forEach((m) => (v += netoImpuesto(movimientos, IMPUESTOS[j - 1][1], m)));
    else meses.forEach((m) => (v += netoImpuesto(movimientos, "Impuesto al credito", m) + netoImpuesto(movimientos, "Impuesto al debito", m)));
    poner(is, ft, j, pesosXL(v), { z: FORMATO, f: `SUM(${col}4:${col}${ft})` });
  }
  XLSX.utils.book_append_sheet(wb, cerrarHoja(is, [10, 20, 20, 20, 22, 22, 16, 18]), "Impuestos");

  // ---------------- Hoja Control
  const cs = nuevaHoja();
  const encC = ["Archivo", "Cuenta", "Período", "Saldo anterior", "Créditos", "Débitos", "Saldo final calculado", "Saldo final banco",
    "Diferencia", "Renglones a revisar", "Ley 25413 créd. banco", "Ley 25413 créd. leído", "Ley 25413 déb. banco", "Ley 25413 déb. leído",
    "SIRCREB banco", "SIRCREB leído", "Resultado"];
  encC.forEach((h, c) => poner(cs, 0, c, h));
  tramos.forEach((t, i) => {
    const f = i + 1;
    const vals = [t.fuente, t.cuenta, t.periodo || "", pesosXL(t.saldoAnterior), pesosXL(t.creditos), pesosXL(t.debitos),
      pesosXL(t.saldoFinalCalculado), pesosXL(t.saldoFinalBanco),
      t.saldoFinalBanco === null || t.saldoFinalCalculado === null ? null : pesosXL(t.saldoFinalCalculado - t.saldoFinalBanco),
      t.filasRevisar, pesosXL(t.totalesBanco.ley25413Cred), pesosXL(t.totalesCalculados.ley25413Cred),
      pesosXL(t.totalesBanco.ley25413Deb), pesosXL(t.totalesCalculados.ley25413Deb),
      pesosXL(t.totalesBanco.sircreb), pesosXL(t.totalesCalculados.sircreb), t.cuadra ? "Cuadra" : "Revisar"];
    vals.forEach((v, c) => poner(cs, f, c, v, typeof v === "number" && c !== 9 ? { z: FORMATO } : {}));
  });
  XLSX.utils.book_append_sheet(wb, cerrarHoja(cs, [30, 24, 26, ...Array(13).fill(18), 10]), "Control");

  return wb;
}
