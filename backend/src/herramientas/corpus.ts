// El corpus: los boletines que el agente puede consultar para responder preguntas.
// Clase 7: búsqueda por palabras sobre un corpus local (la "búsqueda por palabras" de la clase 6).
// Clase 8: si existe DATABASE_URL (Neon) y el índice tiene trozos, la búsqueda pasa a ser por significado
// (vectores). Si no, sigue por palabras, y la traza dice por qué.
import type { Herramienta, ContextoHerramienta } from "../tipos";
import documentos from "../corpus/boletines.json";
import { buscarVectores, conectar, contar } from "../datos/neon";
import { vectorizar } from "../datos/embeddings";

export interface Documento { id: string; numero: number | null; titulo: string; fuente: string; fecha: string; url: string; origen: string; texto: string }
export interface Trozo { texto: string; fuente: string; url: string; id: string; documento: Documento; orden: number }
export interface Hallazgo { texto: string; fuente: string; puntaje: number; url?: string; via: "vector" | "local" }

export const DOCS = documentos as Documento[];

export function ultimoNumeroLocal(): number {
  return Math.max(...DOCS.filter((d) => d.id.startsWith("B")).map((d) => d.numero ?? 0));
}

export function boletinLocal(numero: number): Documento | undefined {
  return DOCS.find((d) => d.numero === numero && d.id.startsWith("B"));
}

/** Trocea un documento en fragmentos de ~700 caracteres cortando en puntos (como en la clase 6). */
export function trocear(d: Documento): Trozo[] {
  const out: Trozo[] = [];
  const fuente = `${d.titulo} (${d.fuente}, ${d.fecha})`;
  const frases = d.texto.split(/(?<=\.)\s+|\n+/);
  let actual = "";
  const empujar = () => { if (actual.trim()) out.push({ texto: actual.trim(), fuente, url: d.url, id: d.id, documento: d, orden: out.length }); actual = ""; };
  for (const f of frases) {
    if ((actual + " " + f).length > 700 && actual) empujar();
    actual += " " + f;
  }
  empujar();
  return out;
}

function trozos(): Trozo[] {
  return DOCS.flatMap(trocear);
}

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PALABRAS_VACIAS = new Set("de la el los las un una y o en que es por para con del al se su sus como mas fue cual cuanto cuantos cuanta hay".split(" "));

/** Búsqueda por palabras: cuenta coincidencias de términos (con un premio si la palabra es rara). */
export function buscarLocal(consulta: string, max = 5): Hallazgo[] {
  const terminos = normalizar(consulta).split(/[^a-z0-9%,.]+/).filter((t) => t.length > 2 && !PALABRAS_VACIAS.has(t));
  const T = trozos();
  const df = new Map<string, number>();
  for (const t of terminos) df.set(t, T.filter((x) => normalizar(x.texto).includes(t)).length || 1);
  return T.map((x) => {
    const n = normalizar(x.texto);
    let puntaje = 0;
    for (const t of terminos) if (n.includes(t)) puntaje += Math.log(1 + T.length / (df.get(t) ?? 1));
    return { texto: x.texto, fuente: x.fuente, url: x.url, puntaje: Number(puntaje.toFixed(2)), via: "local" as const };
  }).filter((h) => h.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje).slice(0, max);
}

/** Búsqueda por significado en Neon (clase 8). Devuelve la misma forma que la local. */
export async function buscarPorSignificado(consulta: string, ctx: ContextoHerramienta, max = 5): Promise<Hallazgo[]> {
  const sql = conectar(ctx.env)!;
  const [vector] = await vectorizar([consulta], ctx.env, "RETRIEVAL_QUERY");
  const filas = await buscarVectores(sql, vector, max);
  return filas.map((f) => ({ ...f, via: "vector" as const }));
}

/** Por significado si se puede; si no, por palabras. La traza explica cuál se usó y por qué. */
export async function buscarEnBoletines(consulta: string, ctx: ContextoHerramienta, max = 5): Promise<Hallazgo[]> {
  const sql = conectar(ctx.env);
  let motivo = "sin DATABASE_URL: busco por palabras en el corpus local";
  if (sql) {
    try {
      const { trozos: n } = await contar(sql);
      if (n > 0) return await buscarPorSignificado(consulta, ctx, max);
      motivo = "el índice de Neon está vacío (abre /indexar): busco por palabras en el corpus local";
    } catch (e) {
      motivo = `la búsqueda por significado falló (${(e as Error).message.slice(0, 160)}): busco por palabras en el corpus local`;
    }
  }
  ctx.traza.push({ n: ctx.traza.length + 1, tipo: "resultado", detalle: `Búsqueda por palabras: ${motivo}.` });
  return buscarLocal(consulta, max);
}

export const herramientaBuscar: Herramienta = {
  nombre: "buscar_en_boletines",
  descripcion: "Busca fragmentos relevantes en los boletines ENE y el glosario del curso a partir de una consulta en lenguaje natural. Devuelve fragmentos con su fuente. Úsala para responder preguntas o para comparar con boletines anteriores.",
  parametros: {
    type: "object",
    properties: {
      consulta: { type: "string", description: "Qué se busca, por ejemplo: tasa de desocupación femenina junio-agosto 2026." },
      max: { type: "integer", description: "Cuántos fragmentos devolver (1 a 8). Por defecto 5." },
    },
    required: ["consulta"],
  },
  async ejecutar(args, ctx) {
    const max = Math.min(Math.max(Number(args.max) || 5, 1), 8);
    return buscarEnBoletines(String(args.consulta ?? ""), ctx, max);
  },
};
