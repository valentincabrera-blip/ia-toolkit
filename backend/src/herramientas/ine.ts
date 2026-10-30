// Herramientas que hablan con el INE.
// La URL de los boletines ENE es predecible: ene-nacional-NNN.pdf. Eso permite "vigilar" sin que nadie avise.
import type { Herramienta, ResumenBoletin, ContextoHerramienta } from "../tipos";
import { leerUltimoBoletinVisto } from "./memoria";
import { boletinLocal, ultimoNumeroLocal } from "./corpus";

const BASE = "https://www.ine.gob.cl/docs/default-source/ocupacion-y-desocupacion/boletines/2026/nacional/ene-nacional-";
const CABECERAS = {
  "User-Agent": "Mozilla/5.0 (compatible; AgenteENE/0.1; curso Agentes de IA para Periodismo, U. de Chile)",
  Accept: "application/pdf,*/*",
};

export function urlBoletin(numero: number): string {
  return `${BASE}${numero}.pdf`;
}

/** ¿Existe el PDF número N en el sitio del INE? (sin descargarlo entero) */
export async function existeEnINE(numero: number): Promise<boolean> {
  try {
    let r = await fetch(urlBoletin(numero), { method: "HEAD", headers: CABECERAS, signal: AbortSignal.timeout(8000) });
    if (r.status === 405 || r.status === 403) {
      // Algunos servidores no aceptan HEAD: pedimos solo el primer byte.
      r = await fetch(urlBoletin(numero), { headers: { ...CABECERAS, Range: "bytes=0-0" }, signal: AbortSignal.timeout(8000) });
    }
    const tipo = r.headers.get("content-type") ?? "";
    return r.ok && (tipo.includes("pdf") || tipo.includes("octet-stream"));
  } catch {
    return false;
  }
}

/** Saca las cifras principales del texto de un boletín con expresiones regulares (mejor esfuerzo). */
export function extraerCifras(texto: string): Partial<ResumenBoletin> {
  const t = texto.replace(/\s+/g, " ");
  const tasa = t.match(/tasa de desocupaci[oó]n nacional\s+(?:fue|alcanz[oó]|se ubic[oó] en)\s+(\d{1,2},\d)\s?%/i)?.[1];
  const variacion = t.match(/desocupaci[oó]n nacional[^.]{0,160}?(\d{1,2},\d)\s?(?:puntos porcentuales|pp\.)/i)?.[1];
  const trimestre = t.match(/trimestre(?: m[oó]vil)?\s+([a-záéíóú]+-[a-záéíóú]+\s+20\d\d)/i)?.[1];
  const fecha = t.match(/Edici[oó]n\s+n[°º.]*\s*\d+\s*\/\s*(\d{1,2}\s+(?:de\s+)?[a-záéíóú]+\s+(?:de\s+)?20\d\d)/i)?.[1];
  const desocupados = t.match(/Desocupad[ao]s\s+([\d]{1,3}(?:\.\d{3}){1,2})/)?.[1];
  const inactivos = t.match(/Inactiv[ao]s\s+([\d]{1,3}(?:\.\d{3}){1,2})/)?.[1];
  return {
    tasa: tasa ? `${tasa}%` : undefined,
    variacionPp: variacion,
    trimestre: trimestre ?? undefined,
    fecha: fecha ?? undefined,
    desocupados: desocupados ?? undefined,
    inactivos: inactivos ?? undefined,
  };
}

/** Descarga el PDF del boletín N, lo convierte a texto con Workers AI y devuelve un resumen estructurado. */
export async function obtenerBoletin(numero: number, ctx: ContextoHerramienta): Promise<ResumenBoletin> {
  const url = urlBoletin(numero);
  try {
    const r = await fetch(url, { headers: CABECERAS, signal: AbortSignal.timeout(20000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !(tipo.includes("pdf") || tipo.includes("octet-stream"))) throw new Error(`INE respondió ${r.status} (${tipo || "sin tipo"})`);
    const blob = await r.blob();
    const conv = (await ctx.env.AI.toMarkdown({ name: `ene-nacional-${numero}.pdf`, blob })) as unknown as { format: string; data?: string; error?: string };
    if (conv.format === "error" || !conv.data) throw new Error(`toMarkdown falló: ${conv.error ?? "sin datos"}`);
    const texto = conv.data.slice(0, 14000);
    return { numero, url, texto, origen: "INE en vivo", ...extraerCifras(texto) };
  } catch (e) {
    // Plan B: el corpus local del curso (los boletines que ya conocemos). El agente sabe que es plan B.
    const local = boletinLocal(numero);
    if (!local) throw new Error(`No pude obtener el boletín ${numero} del INE (${(e as Error).message}) y no está en el corpus local.`);
    ctx.traza.push({ n: ctx.traza.length + 1, tipo: "resultado", detalle: `INE no respondió (${(e as Error).message}); usé el corpus local para el boletín ${numero}.` });
    return { numero, url: local.url, texto: local.texto, origen: "corpus local del curso", ...extraerCifras(local.texto) };
  }
}

export const herramientaUltimoBoletin: Herramienta = {
  nombre: "obtener_ultimo_boletin",
  descripcion:
    "Averigua cuál es el último boletín ENE publicado por el INE (prueba los números siguientes al último visto), lo descarga y devuelve sus cifras principales y su texto. Úsala siempre al comenzar una corrida.",
  parametros: { type: "object", properties: {} },
  async ejecutar(_args, ctx) {
    const visto = await leerUltimoBoletinVisto(ctx.env);
    const base = Math.max(visto ?? 0, ultimoNumeroLocal());
    let ultimo = base;
    for (let n = base + 1; n <= base + 3; n++) {
      if (await existeEnINE(n)) ultimo = n; else break;
    }
    const boletin = await obtenerBoletin(ultimo, ctx);
    return { ...boletin, ultimoVisto: visto, esNuevo: visto === null || ultimo > visto };
  },
};

export const herramientaBoletin: Herramienta = {
  nombre: "obtener_boletin",
  descripcion: "Descarga un boletín ENE específico por su número de edición (por ejemplo 334) y devuelve sus cifras principales y su texto. Útil para comparar con el boletín anterior.",
  parametros: {
    type: "object",
    properties: { numero: { type: "integer", description: "Número de edición del boletín, por ejemplo 334." } },
    required: ["numero"],
  },
  async ejecutar(args, ctx) {
    const numero = Number(args.numero);
    if (!Number.isInteger(numero) || numero < 300 || numero > 400) throw new Error("El número de boletín debe ser un entero entre 300 y 400.");
    return obtenerBoletin(numero, ctx);
  },
};
