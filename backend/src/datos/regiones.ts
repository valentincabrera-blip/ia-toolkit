// LAS CIFRAS REGIONALES (clase 8): una tabla con columnas, no texto. Para "¿cuál es la tasa en Ñuble?" no
// hace falta buscar por significado: se consulta la fila exacta. Este contraste (texto → vectores, cifras →
// tabla) es contenido de la clase.
//
// De dónde salen: backend/src/corpus/regiones.json, armado desde los boletines regionales del INE (cada fila
// trae la URL de su boletín). /indexar?regiones=1 lo carga en la tabla tasas_regionales de Neon. Sin Neon,
// la herramienta lee el archivo directamente.
import datos from "../corpus/regiones.json";
import type { Env } from "../tipos";
import { conectar, consultar, type Sql } from "./neon";

export interface FilaRegion {
  region: string; codigo: string; tasa: number | null; variacion_pp: number | null;
  tasa_hombres: number | null; tasa_mujeres: number | null; informalidad: number | null; fuente: string; url: string;
}
export interface Regional {
  trimestre: string; fecha_publicacion: string; boletin: number; origen: string;
  nacional: { tasa: number; variacion_pp: number; fuente: string; url: string };
  regiones: FilaRegion[];
}

export const REGIONAL = datos as Regional;

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Nombres con que la gente pregunta → nombre oficial de la región. */
const ALIAS: Record<string, string> = {
  rm: "Metropolitana", metropolitana: "Metropolitana", santiago: "Metropolitana", "region metropolitana": "Metropolitana",
  arica: "Arica y Parinacota", parinacota: "Arica y Parinacota", iquique: "Tarapacá", tarapaca: "Tarapacá",
  antofagasta: "Antofagasta", calama: "Antofagasta", atacama: "Atacama", copiapo: "Atacama",
  coquimbo: "Coquimbo", "la serena": "Coquimbo", valparaiso: "Valparaíso", "vina del mar": "Valparaíso",
  ohiggins: "O'Higgins", "o higgins": "O'Higgins", "libertador": "O'Higgins", rancagua: "O'Higgins",
  maule: "Maule", talca: "Maule", nuble: "Ñuble", chillan: "Ñuble",
  biobio: "Biobío", "bio bio": "Biobío", concepcion: "Biobío", araucania: "La Araucanía", "la araucania": "La Araucanía", temuco: "La Araucanía",
  "los rios": "Los Ríos", valdivia: "Los Ríos", "los lagos": "Los Lagos", "puerto montt": "Los Lagos", chiloe: "Los Lagos",
  aysen: "Aysén", aisen: "Aysén", coyhaique: "Aysén", magallanes: "Magallanes", "punta arenas": "Magallanes",
};

/** Encuentra la región a partir de lo que escribió una persona ("rm", "ñuble", "santiago", "VIII"…). */
export function resolverRegion(texto: string): string | null {
  const t = normalizar(texto.replace(/^regi[oó]n (de |del )?/i, ""));
  if (!t) return null;
  if (ALIAS[t]) return ALIAS[t];
  for (const f of REGIONAL.regiones) if (normalizar(f.region) === t || f.codigo.toLowerCase() === t) return f.region;
  for (const [alias, region] of Object.entries(ALIAS)) if (t.includes(alias)) return region;
  for (const f of REGIONAL.regiones) if (normalizar(f.region).includes(t) || t.includes(normalizar(f.region))) return f.region;
  return null;
}

/** Carga las filas del archivo en Neon (reemplaza el trimestre si ya estaba). */
export async function cargarRegiones(sql: Sql): Promise<number> {
  const r = REGIONAL.regiones;
  await consultar(sql, `DELETE FROM tasas_regionales WHERE trimestre = $1`, [REGIONAL.trimestre]);
  await consultar(sql, `
    INSERT INTO tasas_regionales (region, codigo, trimestre, fecha_publicacion, boletin, tasa, variacion_pp,
      tasa_hombres, tasa_mujeres, informalidad, fuente, url)
    SELECT region, codigo, $1, $2::date, $3, tasa, var, th, tm, inf, fuente, url
    FROM unnest($4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::text[], $12::text[])
      AS t(region, codigo, tasa, var, th, tm, inf, fuente, url)`, [
    REGIONAL.trimestre, REGIONAL.fecha_publicacion, REGIONAL.boletin,
    r.map((f) => f.region), r.map((f) => f.codigo), r.map((f) => f.tasa), r.map((f) => f.variacion_pp),
    r.map((f) => f.tasa_hombres), r.map((f) => f.tasa_mujeres), r.map((f) => f.informalidad), r.map((f) => f.fuente), r.map((f) => f.url),
  ]);
  return r.length;
}

export interface TablaRegional extends Omit<Regional, "regiones" | "origen"> { regiones: FilaRegion[]; via: "neon" | "archivo" }

/** Las 16 regiones del último trimestre: desde Neon si está cargado; si no, desde el archivo. */
export async function leerRegiones(env: Env): Promise<TablaRegional> {
  const { origen: _o, ...base } = REGIONAL;
  const sql = conectar(env);
  if (sql) {
    try {
      const filas = await consultar<FilaRegion & { trimestre: string; fecha_publicacion: string; boletin: number }>(sql, `
        SELECT region, codigo, trimestre, fecha_publicacion::text AS fecha_publicacion, boletin,
          tasa::float AS tasa, variacion_pp::float AS variacion_pp, tasa_hombres::float AS tasa_hombres,
          tasa_mujeres::float AS tasa_mujeres, informalidad::float AS informalidad, fuente, url
        FROM tasas_regionales
        WHERE trimestre = (SELECT trimestre FROM tasas_regionales ORDER BY fecha_publicacion DESC NULLS LAST LIMIT 1)
        ORDER BY codigo`);
      if (filas.length) {
        const f0 = filas[0];
        return { ...base, trimestre: f0.trimestre, fecha_publicacion: f0.fecha_publicacion, boletin: f0.boletin,
          regiones: filas.map(({ trimestre: _t, fecha_publicacion: _f, boletin: _b, ...f }) => f), via: "neon" };
      }
    } catch { /* tabla inexistente u otro error: se usa el archivo */ }
  }
  return { ...base, via: "archivo" };
}
