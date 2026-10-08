// =====================================================================
//  REGLAS DE CLASIFICACIÓN
//  Se revisan en orden: gana la PRIMERA regla que coincide.
//  - contiene: todos los textos deben aparecer en la descripción
//  - tipo (opcional): "Credito" o "Debito" para que la regla solo
//    aplique a ese tipo de movimiento
//  Para agregar una regla, copiá una línea y cambiá los textos.
//  Lo que no coincide con ninguna queda como "Sin clasificar".
// =====================================================================

const REGLAS = [
  // --- Impuesto a los débitos y créditos (Ley 25413) ---
  { contiene: ["LEY 25413", "DEB"],  imputacion: "Impuesto al debito" },   // incluye REINTEGRO .../DEB
  { contiene: ["LEY 25413", "CRED"], imputacion: "Impuesto al credito" },  // incluye REINTEGRO .../CRED
  { contiene: ["GRAVAMEN IBTC"],     imputacion: "Gravamen IBTC" },

  // --- Ingresos Brutos ---
  { contiene: ["SIRCREB"],           imputacion: "Sircreb" },
  { contiene: ["ING BRUT"],          imputacion: "Sircreb" },

  // --- IVA ---
  { contiene: ["RETEN. I.V.A"],      imputacion: "Percep IVA" },
  { contiene: ["I.V.A. BASE"],       imputacion: "IVA" },

  // --- Gastos bancarios ---
  { contiene: ["ECHEQ.EMI"],         imputacion: "Comisiones y gastos" },
  { contiene: ["COMIS"],             imputacion: "Comisiones y gastos" },
  { contiene: ["COMISION"],          imputacion: "Comisiones y gastos" },
  { contiene: ["COM ECH"],           imputacion: "Comisiones y gastos" },
  { contiene: ["COM.CH"],            imputacion: "Comisiones y gastos" },
  { contiene: ["COM DIS"],           imputacion: "Comisiones y gastos" },
  { contiene: ["INTERESES"],         imputacion: "Intereses" },

  // --- Préstamos ---
  { contiene: ["PAGO PRESTAMO"],     imputacion: "Pago prestamos" },
  { contiene: ["ALTA PRESTAMO"],     imputacion: "Cobro prestamos" },
  { contiene: ["ACREDITACION PRESTAMO"], imputacion: "Cobro prestamos" },

  // --- Impuestos pagados ---
  { contiene: ["VEP"],               imputacion: "Pago AFIP" },

  // --- Cheques de terceros / valores ---
  { contiene: ["DEP.CHEQUE"],        imputacion: "Valores a depositar" },
  { contiene: ["CAM.FED"],           imputacion: "Valores a depositar" },
  { contiene: ["CAM FED"],           imputacion: "Valores a depositar" },
  { contiene: ["CHEQ.RECH"],         imputacion: "Valores a depositar" },
  { contiene: ["RECHAZO CHEQ"],      imputacion: "Valores a depositar" },
  { contiene: ["CHQ POSTERGADO"],    imputacion: "Valores a depositar" },

  // --- Efectivo ---
  { contiene: ["DEP.EFECTIVO"],      imputacion: "Deposito efectivo" },

  // --- Cheques propios pagados ---
  { contiene: ["48HS."],             imputacion: "Proveedores" },
  { contiene: ["PAGO CHEQUE"],       imputacion: "Proveedores" },

  // --- Transferencias: según entren o salgan ---
  { contiene: ["TRANSF"], tipo: "Credito", imputacion: "Deudores por ventas" },
  { contiene: ["TRANF"],  tipo: "Credito", imputacion: "Deudores por ventas" },
  { contiene: ["DEBIN"],  tipo: "Credito", imputacion: "Deudores por ventas" },
  { contiene: ["CREDITOS VS. NO GRAVADOS"], imputacion: "Deudores por ventas" },
  { contiene: ["CRED LIQ"],          imputacion: "Deudores por ventas" },

  { contiene: ["TRANSF"], tipo: "Debito", imputacion: "Proveedores" },
  { contiene: ["TRANF"],  tipo: "Debito", imputacion: "Proveedores" },
  { contiene: ["TRAN.INTERB"], tipo: "Debito", imputacion: "Proveedores" },
  { contiene: ["DEBIN"],  tipo: "Debito", imputacion: "Proveedores" },
  { contiene: ["PAGO LINK"],         imputacion: "Proveedores" },
  { contiene: ["PAGO SERV"],         imputacion: "Proveedores" },
  { contiene: ["DEBITO AUTOMATICO"], imputacion: "Proveedores" },
  { contiene: ["PAGO FEDERACION"],   imputacion: "Proveedores" },
  { contiene: ["TC PYME"],           imputacion: "Proveedores" },
  { contiene: ["VARIOS"],            imputacion: "Proveedores" },
];
