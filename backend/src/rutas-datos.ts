// Las rutas de la clase 8: el RAG propio en Neon y las cifras regionales.
//   /indexar       llena tu base de datos (trozos + vectores, y la tabla regional). Pide la clave de aprobación.
//   /regiones      las 16 regiones del último trimestre (para el mapa).
//   /evaluar       compara la búsqueda por palabras con la búsqueda por significado, pregunta por pregunta.
//   /exportar.csv  cifras y fuentes en una planilla.
import type { Hono } from "hono";
import type { Env } from "./tipos";
import { conectar, contar } from "./datos/neon";
import { indexar } from "./datos/indexar";
import { leerRegiones } from "./datos/regiones";
import { evaluar, evaluarHtml } from "./datos/evaluar";
import { exportarCsv } from "./datos/exportar";

/** Para GET /: ¿el agente busca por significado o por palabras? ¿Cuántos trozos y regiones tiene? */
export async function estadoRag(env: Env) {
  const sql = conectar(env);
  if (!sql) return { rag: "local" as const, trozos: 0, regiones: 0, ultimoTrimestreRegional: null, nota: "sin DATABASE_URL: busca por palabras en el corpus local" };
  try {
    const n = await contar(sql);
    return {
      rag: n.trozos > 0 ? ("vector" as const) : ("local" as const),
      trozos: n.trozos, regiones: n.regiones, ultimoTrimestreRegional: n.trimestre,
      nota: n.trozos > 0 ? "busca por significado en Neon" : "Neon conectado pero vacío: abre /indexar?clave=<tu clave de aprobación>",
    };
  } catch (e) {
    return { rag: "local" as const, trozos: 0, regiones: 0, ultimoTrimestreRegional: null, nota: `Neon no respondió (${(e as Error).message.slice(0, 120)}): busca por palabras` };
  }
}

export const RUTAS_DATOS = {
  "GET /indexar": "llena la base de datos en Neon. ?clave=<CLAVE_APROBACION>. Opcional: &boletin=336, &regiones=1, &reiniciar=1",
  "GET /regiones": "tasas de desocupación de las 16 regiones del último trimestre",
  "GET /evaluar": "compara la búsqueda por palabras y por significado con el banco de preguntas (tabla en el navegador; ?via=local|vector&formato=json para los datos)",
  "GET /exportar.csv": "cifras y fuentes de los borradores y las regiones, para Excel o Sheets",
};

export function registrarRutasDatos(app: Hono<{ Bindings: Env }>) {
  const manejarIndexar = async (c: { env: Env; req: { query(n: string): string | undefined; header(n: string): string | undefined } }) => {
    const clave = c.req.query("clave") ?? c.req.header("x-clave") ?? "";
    if (!c.env.CLAVE_APROBACION || clave !== c.env.CLAVE_APROBACION) {
      return { codigo: 401 as const, cuerpo: { ok: false, error: "Falta la clave o no coincide: abre /indexar?clave=<tu clave de aprobación>." } };
    }
    const si = (n: string) => ["1", "true", "si", "sí"].includes((c.req.query(n) ?? "").toLowerCase());
    const r = await indexar(c.env, { boletin: Number(c.req.query("boletin")) || undefined, soloRegiones: si("regiones"), reiniciar: si("reiniciar") });
    return { codigo: (r.ok ? 200 : 400) as 200 | 400, cuerpo: r };
  };
  app.get("/indexar", async (c) => { const r = await manejarIndexar(c); return c.json(r.cuerpo, r.codigo); });
  app.post("/indexar", async (c) => { const r = await manejarIndexar(c); return c.json(r.cuerpo, r.codigo); });

  app.get("/regiones", async (c) => {
    const t = await leerRegiones(c.env);
    if (!t.regiones.length) return c.json({ error: "Este agente todavía no cargó datos regionales: abre /indexar?clave=<tu clave>&regiones=1." }, 404);
    return c.json(t);
  });

  app.get("/evaluar", async (c) => {
    // En el navegador y sin ?via: la tabla con las dos búsquedas lado a lado. Si no, los datos en JSON.
    const enNavegador = (c.req.header("accept") ?? "").includes("text/html") && c.req.query("formato") !== "json";
    if (enNavegador && !c.req.query("via")) return c.html(await evaluarHtml(c.env));
    const via = c.req.query("via") === "vector" ? "vector" : "local";
    const max = Math.min(Math.max(Number(c.req.query("max")) || 1, 1), 5);
    const r = await evaluar(c.env, via, max);
    return c.json(r, r.ok ? 200 : 400);
  });

  app.get("/exportar.csv", async (c) => {
    return c.body(await exportarCsv(c.env), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="agente-ene-cifras.csv"',
    });
  });
}
