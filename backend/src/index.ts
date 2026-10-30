// La puerta de entrada del backend: las rutas HTTP (lo que el frontend y los teléfonos llaman),
// el servidor MCP en /mcp y el disparador programado (cron).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMcpHandler } from "agents/mcp/server";
import type { Env } from "./tipos";
import { correrAgente, motorActivo, responderPregunta } from "./agente/bucle";
import { herramientas } from "./herramientas";
import { leerBorrador, leerNotaPublicada, leerUltimoBoletinVisto, listarBorradores, guardarBorrador, publicarNota, soltarCandado, tomarCandado } from "./herramientas/memoria";
import { crearServidorMcp } from "./mcp";
import { estadoRag, registrarRutasDatos, RUTAS_DATOS } from "./rutas-datos";

// La clase de la memoria (Durable Object) tiene que exportarse desde aquí para que Cloudflare la encuentre.
export { Memoria } from "./memoria-durable";

const app = new Hono<{ Bindings: Env }>();

// El frontend vive en otro dominio (Vercel): hay que permitirle hablar con este backend.
app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "x-clave"], allowMethods: ["GET", "POST", "OPTIONS"] }));

/** Salud e inventario: qué es este agente y qué sabe hacer. */
app.get("/", async (c) => {
  const [visto, rag] = await Promise.all([leerUltimoBoletinVisto(c.env), estadoRag(c.env)]);
  return c.json({
    nombre: "Agente ENE",
    equipo: c.env.NOMBRE_EQUIPO ?? null,
    estado: "en línea",
    motor: motorActivo(c.env),
    modelo: c.env.GEMINI_API_KEY ? (c.env.GEMINI_MODELOS ?? "gemini").split(",")[0] : "simulado (sin clave de Gemini)",
    ultimoBoletinVisto: visto,
    ...rag,
    herramientas: herramientas.map((h) => ({ nombre: h.nombre, descripcion: h.descripcion })),
    rutas: {
      "GET /": "este inventario",
      "GET /correr": "dispara una corrida desde el navegador. Opcional: ?forzar=1&boletin=335",
      "POST /correr": "dispara una corrida del agente. Cuerpo opcional: { forzar: true, boletin: 335 }",
      "GET /borradores": "lista de borradores",
      "GET /borradores/:id": "un borrador con su traza",
      "POST /aprobar": "aprueba y publica un borrador. Cuerpo: { id, nombre }. Cabecera x-clave",
      "POST /rechazar": "rechaza un borrador. Cuerpo: { id, nombre }. Cabecera x-clave",
      "GET /nota": "la nota publicada",
      "POST /preguntar": "responde una pregunta con el corpus. Cuerpo: { pregunta }",
      "POST /mcp": "servidor MCP (herramientas para otros agentes)",
      ...RUTAS_DATOS,
    },
  });
});

/** Disparo manual: una persona aprieta el botón (POST) o abre la URL en el navegador (GET). */
async function correr(env: Env, op: { forzar: boolean; boletin?: number }) {
  // Un candado simple: si 24 personas aprietan el botón a la vez, corre una sola vez.
  if (!(await tomarCandado(env, 90))) return { codigo: 409 as const, cuerpo: { error: "Ya hay una corrida en curso. Espera unos segundos y mira /borradores." } };
  try {
    return { codigo: 200 as const, cuerpo: await correrAgente(env, { motivo: "manual", ...op }) };
  } finally {
    await soltarCandado(env);
  }
}

app.post("/correr", async (c) => {
  const cuerpo = (await c.req.json().catch(() => ({}))) as { forzar?: boolean; boletin?: number };
  const r = await correr(c.env, { forzar: Boolean(cuerpo.forzar), boletin: cuerpo.boletin ? Number(cuerpo.boletin) : undefined });
  return c.json(r.cuerpo, r.codigo);
});

// Para el primer punto de control de la clase: abrir <URL>/correr?forzar=1 en el navegador y leer la traza.
app.get("/correr", async (c) => {
  const forzar = ["1", "true", "si", "sí"].includes((c.req.query("forzar") ?? "").toLowerCase());
  const boletin = Number(c.req.query("boletin")) || undefined;
  const r = await correr(c.env, { forzar, boletin });
  return c.json(r.cuerpo, r.codigo);
});

app.get("/borradores", async (c) => c.json(await listarBorradores(c.env)));

app.get("/borradores/:id", async (c) => {
  const b = await leerBorrador(c.env, c.req.param("id"));
  return b ? c.json(b) : c.json({ error: "No existe ese borrador." }, 404);
});

app.get("/nota", async (c) => {
  const n = await leerNotaPublicada(c.env);
  return n ? c.json(n) : c.json({ mensaje: "Todavía no hay una nota publicada. Hay que aprobar un borrador." }, 404);
});

/** Humano en el bucle: nada se publica sin una persona y una clave. */
async function decidir(c: { env: Env; req: { json(): Promise<unknown>; header(n: string): string | undefined } }, estado: "aprobado" | "rechazado") {
  const clave = c.req.header("x-clave") ?? "";
  if (!c.env.CLAVE_APROBACION || clave !== c.env.CLAVE_APROBACION) return { codigo: 401 as const, cuerpo: { error: "Clave de aprobación incorrecta." } };
  const { id, nombre } = (await c.req.json().catch(() => ({}))) as { id?: string; nombre?: string };
  if (!id) return { codigo: 400 as const, cuerpo: { error: "Falta el id del borrador." } };
  const b = await leerBorrador(c.env, id);
  if (!b) return { codigo: 404 as const, cuerpo: { error: "No existe ese borrador." } };
  b.estado = estado;
  b.aprobadoPor = nombre || "editor sin nombre";
  b.aprobadoEn = new Date().toISOString();
  await guardarBorrador(c.env, b);
  if (estado === "aprobado") await publicarNota(c.env, b);
  return { codigo: 200 as const, cuerpo: { ok: true, id, estado, publicado: estado === "aprobado" } };
}
app.post("/aprobar", async (c) => { const r = await decidir(c, "aprobado"); return c.json(r.cuerpo, r.codigo); });
app.post("/rechazar", async (c) => { const r = await decidir(c, "rechazado"); return c.json(r.cuerpo, r.codigo); });

/** Preguntas de lectores: RAG (por palabras, o por significado en Neon desde la clase 8) + modelo. */
app.post("/preguntar", async (c) => {
  const { pregunta } = (await c.req.json().catch(() => ({}))) as { pregunta?: string };
  if (!pregunta || pregunta.trim().length < 4) return c.json({ error: "Falta la pregunta." }, 400);
  return c.json(await responderPregunta(c.env, pregunta.trim().slice(0, 500)));
});

// Clase 8: indexar, regiones, evaluar y exportar (ver rutas-datos.ts).
registrarRutasDatos(app);

app.notFound((c) => c.json({ error: "Esa ruta no existe. GET / muestra las rutas disponibles." }, 404));
app.onError((e, c) => c.json({ error: e.message }, 500));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") return createMcpHandler(() => crearServidorMcp(env), { route: "/mcp" })(request, env, ctx);
    return app.fetch(request, env, ctx);
  },

  /** El disparador: Cloudflare llama a esto según el cron de wrangler.jsonc. Nadie aprieta nada. */
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(correrAgente(env, { motivo: "cron" }).then((r) => console.log("Corrida por cron:", "sinNovedad" in r ? r.motivo : `borrador ${r.id}`)));
  },
} satisfies ExportedHandler<Env>;
