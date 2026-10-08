
const HUELLA = "1b9b1b68b49b555e5c8298a51a4fdfb0b8a5ac6eaba0353f7fa1675b1ea694ca";

async function calcularHuella(texto) {
  const datos = new TextEncoder().encode("conversorpdf:" + texto);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function abrir() {
  document.getElementById("acceso").hidden = true;
  document.querySelector("main").hidden = false;
}

(function () {
  let recordado = false;
  try { recordado = sessionStorage.getItem("acceso") === HUELLA; } catch (e) {}
  if (recordado) return abrir();

  const form = document.getElementById("form-acceso");
  const campo = document.getElementById("clave");
  const error = document.getElementById("error-acceso");
  campo.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!window.crypto || !crypto.subtle) {
      error.textContent = "Abrí la página desde su link https o con Live Server: así el navegador no permite verificar la contraseña.";
      return;
    }
    if ((await calcularHuella(campo.value)) === HUELLA) {
      try { sessionStorage.setItem("acceso", HUELLA); } catch (e) {}
      abrir();
    } else {
      error.textContent = "Contraseña incorrecta.";
      campo.select();
    }
  });
})();
