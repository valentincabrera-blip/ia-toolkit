// EVALUAR (clase 8): ¿qué búsqueda encuentra mejor? Corre el banco de preguntas del curso contra la búsqueda
// por palabras (local) y por significado (vector) y muestra, por pregunta, el mejor fragmento y su fuente.
// No llama al modelo que redacta: solo mide la recuperación (cuesta vectores, no tokens de respuesta).
//   /evaluar                 en el navegador: una tabla con las dos búsquedas lado a lado (para proyectar)
//   /evaluar?via=local       solo por palabras;  /evaluar?via=vector  solo por significado
//   &formato=json            los datos en vez de la tabla
import banco from "../corpus/banco_preguntas.json";
import type { Env } from "../tipos";
import { buscarLocal } from "../herramientas/corpus";
import { buscarVariosVectores, conectar, contar } from "./neon";
import { vectorizar } from "./embeddings";

interface Pregunta { id: string; pregunta: string; tipo: "texto" | "cifra" | "trampa"; esperado: string; fuente_esperada: string; fuente_clave: string | null }
const PREGUNTAS = (banco as { preguntas: Pregunta[] }).preguntas;

type Hallazgo = { texto: string; fuente: string; puntaje: number };

async function recuperar(env: Env, via: "local" | "vector", max: number): Promise<{ ok: true; resultados: Hallazgo[][] } | { ok: false; error: string }> {
  if (via === "local") return { ok: true, resultados: PREGUNTAS.map((p) => buscarLocal(p.pregunta, max)) };
  const sql = conectar(env);
  if (!sql) return { ok: false, error: "Sin DATABASE_URL no hay búsqueda por significado." };
  if ((await contar(sql)).trozos === 0) return { ok: false, error: "El índice de Neon está vacío: abre /indexar primero." };
  const vectores = await vectorizar(PREGUNTAS.map((p) => p.pregunta), env, "RETRIEVAL_QUERY");
  return { ok: true, resultados: await buscarVariosVectores(sql, vectores, max) };
}

/** ¿El mejor fragmento viene del documento esperado? null = no aplica (trampas sin fuente, preguntas para la tabla). */
function acierta(p: Pregunta, h?: Hallazgo): boolean | null {
  if (!p.fuente_clave) return null;
  return Boolean(h && h.fuente.includes(p.fuente_clave));
}

export async function evaluar(env: Env, via: "local" | "vector", max: number) {
  const t0 = Date.now();
  const r = await recuperar(env, via, max);
  if (!r.ok) return { ok: false, error: r.error + (via === "vector" ? " Prueba /evaluar?via=local." : "") };
  const preguntas = PREGUNTAS.map((p, i) => ({
    id: p.id, tipo: p.tipo, pregunta: p.pregunta, esperado: p.esperado, fuente_esperada: p.fuente_esperada,
    acierta: acierta(p, r.resultados[i][0]),
    encontrado: r.resultados[i].map((h) => ({ fragmento: h.texto.slice(0, 280), fuente: h.fuente, puntaje: h.puntaje })),
  }));
  const evaluables = preguntas.filter((p) => p.acierta !== null);
  return {
    ok: true,
    via,
    explicacion: via === "vector"
      ? "Búsqueda por significado: la pregunta y cada trozo se convierten en vectores y se comparan (puntaje 0 a 1)."
      : "Búsqueda por palabras: cuenta qué palabras de la pregunta aparecen en cada trozo (puntaje sin techo).",
    aciertos: `${evaluables.filter((p) => p.acierta).length} de ${evaluables.length}`,
    preguntas,
    segundos: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Las dos búsquedas lado a lado, en una página para proyectar en clase. */
export async function evaluarHtml(env: Env): Promise<string> {
  const [local, vector] = await Promise.all([evaluar(env, "local", 1), evaluar(env, "vector", 1)]);
  const celda = (r: Awaited<ReturnType<typeof evaluar>>, i: number) => {
    if (!r.ok || !r.preguntas) return `<td class="nada">${esc(("error" in r && r.error) || "sin datos")}</td>`;
    const p = r.preguntas[i];
    const h = p.encontrado[0];
    const marca = p.acierta === null ? "" : p.acierta ? `<span class="si">✓</span> ` : `<span class="no">✗</span> `;
    return h ? `<td>${marca}<b>${esc(h.fuente)}</b> <span class="pt">${String(h.puntaje).replace(".", ",")}</span><div class="fr">${esc(h.fragmento.slice(0, 180))}…</div></td>` : `<td class="nada">(nada)</td>`;
  };
  const filas = PREGUNTAS.map((p, i) => `<tr><td><span class="tipo ${p.tipo}">${p.tipo}</span> ${esc(p.pregunta)}<div class="fr">Esperado: ${esc(p.esperado)} · ${esc(p.fuente_esperada)}</div></td>${celda(local, i)}${celda(vector, i)}</tr>`).join("");
  const total = (r: Awaited<ReturnType<typeof evaluar>>) => ("aciertos" in r ? r.aciertos : "—");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>¿Qué búsqueda encuentra mejor?</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#16161a}h1{font:700 26px Georgia,serif;margin:0 0 4px}p{color:#555;margin:0 0 16px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e2e2e5;padding:8px;vertical-align:top;text-align:left}th{background:#f6f6f7;position:sticky;top:0}
td:first-child{width:34%}.fr{color:#6b6b70;font-size:13px;margin-top:3px}.pt{color:#6b6b70;font-size:12px}.si{color:#1a7f37;font-weight:700}.no{color:#c8102e;font-weight:700}
.tipo{font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-radius:4px;padding:1px 5px;background:#eee}.trampa{background:#fde2e2}.cifra{background:#e6f0ff}.texto{background:#e9f7ec}.nada{color:#999}</style></head>
<body><h1>¿Qué búsqueda encuentra mejor?</h1>
<p>El mismo banco de ${PREGUNTAS.length} preguntas, con el mejor fragmento que encuentra cada búsqueda. ✓ = viene del documento esperado. Las trampas no tienen respuesta en los documentos: ninguna búsqueda "sabe" que algo no consta.</p>
<table><thead><tr><th>Pregunta</th><th>Por palabras · aciertos ${total(local)}</th><th>Por significado · aciertos ${total(vector)}</th></tr></thead><tbody>${filas}</tbody></table>
<p style="margin-top:14px">Los puntajes no se comparan entre columnas: el de palabras no tiene techo; el de significado va de 0 a 1. Datos: /evaluar?via=local&amp;formato=json · /evaluar?via=vector&amp;formato=json</p></body></html>`;
}
