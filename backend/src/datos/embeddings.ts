// LOS VECTORES (clase 8): convertir un texto en una lista de 768 números que representa su significado.
// Dos textos que dicen lo mismo con otras palabras quedan "cerca". Se usa el mismo modelo de la clase 6:
// gemini-embedding-001, con la misma clave de Gemini que ya está guardada como secreto.
import type { Env } from "../tipos";

const MODELO = "gemini-embedding-001";
const DIMENSIONES = 768;
const POR_LOTE = 100;

export type Tarea = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Gemini solo entrega vectores de largo 1 con 3072 dimensiones; con 768 hay que normalizarlos a mano. */
function normalizar(v: number[]): number[] {
  const largo = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Number((x / largo).toFixed(6)));
}

export async function vectorizar(textos: string[], env: Env, tarea: Tarea): Promise<number[][]> {
  if (!env.GEMINI_API_KEY) throw new Error("Sin clave de Gemini no hay vectores; la búsqueda sigue por palabras.");
  const salida: number[][] = [];
  for (let i = 0; i < textos.length; i += POR_LOTE) {
    const lote = textos.slice(i, i + POR_LOTE);
    const cuerpo = JSON.stringify({
      requests: lote.map((t) => ({
        model: `models/${MODELO}`,
        content: { parts: [{ text: t }] },
        taskType: tarea,
        outputDimensionality: DIMENSIONES,
      })),
    });
    let r: Response | null = null;
    for (let intento = 0; intento < 3; intento++) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:batchEmbedContents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: cuerpo,
        signal: AbortSignal.timeout(30000),
      });
      if (r.status !== 429 && r.status < 500) break;
      await new Promise((res) => setTimeout(res, 2000 * (intento + 1)));   // cuota o caída: esperar y reintentar
    }
    if (!r || !r.ok) throw new Error(`Gemini no entregó los vectores (HTTP ${r?.status}): ${(await r?.text())?.slice(0, 200)}`);
    const j = (await r.json()) as { embeddings: Array<{ values: number[] }> };
    for (const e of j.embeddings) salida.push(normalizar(e.values));
  }
  return salida;
}
