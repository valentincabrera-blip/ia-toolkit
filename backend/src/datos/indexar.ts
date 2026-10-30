// INDEXAR (clase 8): llenar tu base de datos. Para cada documento:
//   1. se trocea en fragmentos de ~700 caracteres (igual que en la clase 6);
//   2. Gemini convierte cada fragmento en un vector de 768 números;
//   3. fragmento + vector se guardan en la tabla `trozos` de Neon.
// Además se cargan las cifras regionales en la tabla `tasas_regionales`.
// Se abre desde el navegador: /indexar?clave=<CLAVE_APROBACION>
import type { ContextoHerramienta, Env } from "../tipos";
import { DOCS, trocear, ultimoNumeroLocal, type Documento } from "../herramientas/corpus";
import { existeEnINE, obtenerBoletin } from "../herramientas/ine";
import { asegurarEsquema, conectar, consultar, guardarTrozos, type Sql } from "./neon";
import { vectorizar } from "./embeddings";
import { cargarRegiones, REGIONAL } from "./regiones";

export interface OpcionesIndexar { boletin?: number; soloRegiones?: boolean; reiniciar?: boolean }

const MESES: Record<string, string> = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };

/** "30 septiembre 2026" o "30 de septiembre de 2026" → "2026-09-30". */
function fechaIso(texto?: string): string | null {
  const m = texto?.toLowerCase().match(/(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(20\d\d)/);
  if (!m || !MESES[m[2]]) return null;
  return `${m[3]}-${MESES[m[2]]}-${m[1].padStart(2, "0")}`;
}

/** Un boletín que no está en el corpus local se descarga del INE (como hace la herramienta obtener_boletin). */
async function documentoDesdeINE(numero: number, ctx: ContextoHerramienta): Promise<Documento> {
  const b = await obtenerBoletin(numero, ctx);
  return {
    id: `B${numero}`, numero, titulo: `Boletín ENE n.º ${numero}${b.trimestre ? ` · ${b.trimestre}` : ""}`, fuente: "INE",
    fecha: fechaIso(b.fecha) ?? "", url: b.url, origen: b.origen, texto: b.texto,
  };
}

async function indexarDocumento(sql: Sql, env: Env, d: Documento) {
  const partes = trocear(d);
  const vectores = await vectorizar(partes.map((p) => `${d.titulo}\n${p.texto}`), env, "RETRIEVAL_DOCUMENT");
  await guardarTrozos(sql, d.id, partes.map((p, i) => ({
    documento: d.id, numero: d.numero, titulo: d.titulo, fuente: d.fuente, url: d.url, fecha: /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : null,
    orden: p.orden, texto: p.texto, embedding: vectores[i],
  })));
  return { documento: d.id, titulo: d.titulo, trozos: partes.length };
}

export async function indexar(env: Env, op: OpcionesIndexar) {
  const t0 = Date.now();
  const sql = conectar(env);
  if (!sql) {
    return { ok: false, error: "Falta el secreto DATABASE_URL: crea tu proyecto en Neon y guarda la cadena de conexión en Cloudflare (Settings → Runtime variables and secrets). Mientras tanto, el agente busca por palabras en el corpus local.", via: "local" };
  }
  if (!env.GEMINI_API_KEY && !op.soloRegiones) {
    return { ok: false, error: "Falta el secreto GEMINI_API_KEY: sin clave de Gemini no hay vectores.", via: "local" };
  }
  await asegurarEsquema(sql);
  if (op.reiniciar) {
    await consultar(sql, `TRUNCATE trozos`);
    await consultar(sql, `TRUNCATE tasas_regionales`);
  }

  const documentos: Array<{ documento: string; titulo: string; trozos: number }> = [];
  const avisos: string[] = [];
  const ctx: ContextoHerramienta = { env, traza: [] };

  if (!op.soloRegiones) {
    let lista: Documento[];
    if (op.boletin) {
      const local = DOCS.find((d) => d.numero === op.boletin && d.id.startsWith("B"));
      try {
        lista = [local ?? (await documentoDesdeINE(op.boletin, ctx))];
      } catch (e) {
        return { ok: false, error: `No pude obtener el boletín ${op.boletin}: ${(e as Error).message}`, segundos: segundos(t0) };
      }
    } else {
      lista = [...DOCS];
      // ¿Ya salió el boletín siguiente al último del corpus (por ejemplo, el 336)? Si está en el INE, se suma.
      const siguiente = ultimoNumeroLocal() + 1;
      if (await existeEnINE(siguiente)) {
        try { lista.push(await documentoDesdeINE(siguiente, ctx)); } catch (e) { avisos.push(`El boletín ${siguiente} está publicado pero no pude leerlo: ${(e as Error).message}`); }
      }
    }
    for (const d of lista) documentos.push(await indexarDocumento(sql, env, d));
    for (const p of ctx.traza) avisos.push(p.detalle);
  }

  const debeCargarRegiones = op.soloRegiones || !op.boletin;
  const regiones = debeCargarRegiones && REGIONAL.regiones.length ? await cargarRegiones(sql) : 0;
  const total = documentos.reduce((s, d) => s + d.trozos, 0);
  return {
    ok: true,
    documentos,
    trozos: total,
    vectores: total,
    regiones,
    trimestreRegional: regiones ? REGIONAL.trimestre : null,
    via: "vector",
    avisos,
    segundos: segundos(t0),
  };
}

function segundos(t0: number) {
  return Number(((Date.now() - t0) / 1000).toFixed(1));
}
