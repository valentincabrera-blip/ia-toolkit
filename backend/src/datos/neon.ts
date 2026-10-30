// LA BASE DE DATOS DEL RAG (clase 8): Postgres en Neon, con la extensión pgvector.
// Cada estudiante crea su propio proyecto en neon.com y guarda la cadena de conexión como el secreto
// DATABASE_URL en Cloudflare. Si el secreto no está, conectar() devuelve null y todo sigue funcionando con la
// búsqueda por palabras del corpus local.
//
// Dos tablas, dos ideas:
//   - trozos            → texto + vector: para preguntas de TEXTO ("¿qué es un inactivo?"), búsqueda por significado;
//   - tasas_regionales  → cifras en columnas: para preguntas de NÚMEROS ("¿tasa en Ñuble?"), consulta exacta.
import { neon } from "@neondatabase/serverless";
import type { Env } from "../tipos";

export type Sql = ReturnType<typeof neon>;

export function conectar(env: Env): Sql | null {
  if (!env.DATABASE_URL) return null;
  return neon(env.DATABASE_URL);
}

/** Corre una consulta. Si Neon estaba dormido (se suspende tras 5 minutos sin uso), reintenta una vez. */
export async function consultar<T = Record<string, unknown>>(sql: Sql, texto: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await sql.query(texto, params)) as T[];
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (!/suspend|terminat|timeout|ECONNRESET|fetch failed|503|502/i.test(msg)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return (await sql.query(texto, params)) as T[];
  }
}

export async function asegurarEsquema(sql: Sql): Promise<void> {
  await consultar(sql, `CREATE EXTENSION IF NOT EXISTS vector`);
  await consultar(sql, `CREATE TABLE IF NOT EXISTS trozos (
    id serial PRIMARY KEY, documento text, numero int, titulo text, fuente text, url text, fecha date,
    orden int, texto text NOT NULL, embedding vector(768) NOT NULL)`);
  await consultar(sql, `CREATE INDEX IF NOT EXISTS trozos_embedding_idx ON trozos USING hnsw (embedding vector_cosine_ops)`);
  await consultar(sql, `CREATE TABLE IF NOT EXISTS tasas_regionales (
    region text, codigo text, trimestre text, fecha_publicacion date, boletin int,
    tasa numeric(4,1), variacion_pp numeric(4,1), tasa_hombres numeric(4,1), tasa_mujeres numeric(4,1),
    informalidad numeric(4,1), fuente text, url text, PRIMARY KEY (region, trimestre))`);
}

/** Cuántos trozos y regiones hay (sin fallar si las tablas todavía no existen). */
export async function contar(sql: Sql): Promise<{ trozos: number; regiones: number; trimestre: string | null }> {
  // Primero se pregunta si las tablas existen: Postgres rechaza una consulta que nombra una tabla inexistente.
  const [t] = await consultar<{ hay_trozos: boolean; hay_regiones: boolean }>(sql,
    `SELECT to_regclass('trozos') IS NOT NULL AS hay_trozos, to_regclass('tasas_regionales') IS NOT NULL AS hay_regiones`);
  if (!t?.hay_trozos || !t?.hay_regiones) return { trozos: 0, regiones: 0, trimestre: null };
  const [f] = await consultar<{ trozos: number; regiones: number; trimestre: string | null }>(sql, `
    SELECT (SELECT count(*)::int FROM trozos) AS trozos,
           (SELECT count(*)::int FROM tasas_regionales) AS regiones,
           (SELECT trimestre FROM tasas_regionales ORDER BY fecha_publicacion DESC NULLS LAST LIMIT 1) AS trimestre`);
  return { trozos: f?.trozos ?? 0, regiones: f?.regiones ?? 0, trimestre: f?.trimestre ?? null };
}

export interface TrozoParaGuardar {
  documento: string; numero: number | null; titulo: string; fuente: string; url: string; fecha: string | null;
  orden: number; texto: string; embedding: number[];
}

/** Reemplaza los trozos de un documento (así reindexar no duplica). Una sola petición a Neon por documento. */
export async function guardarTrozos(sql: Sql, documento: string, trozos: TrozoParaGuardar[]): Promise<void> {
  await consultar(sql, `DELETE FROM trozos WHERE documento = $1`, [documento]);
  if (!trozos.length) return;
  await consultar(sql, `
    INSERT INTO trozos (documento, numero, titulo, fuente, url, fecha, orden, texto, embedding)
    SELECT d, n, ti, f, u, fe::date, o, tx, e::vector
    FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[])
      AS t(d, n, ti, f, u, fe, o, tx, e)`, [
    trozos.map((t) => t.documento), trozos.map((t) => t.numero), trozos.map((t) => t.titulo),
    trozos.map((t) => t.fuente), trozos.map((t) => t.url), trozos.map((t) => t.fecha), trozos.map((t) => t.orden),
    trozos.map((t) => t.texto), trozos.map((t) => `[${t.embedding.join(",")}]`),
  ]);
}

export interface FilaVector { texto: string; fuente: string; url: string; puntaje: number }

function aFila(f: { texto: string; titulo: string; fuente: string; fecha: string | null; url: string; distancia: number }): FilaVector {
  return {
    texto: f.texto,
    fuente: `${f.titulo} (${f.fuente}${f.fecha ? `, ${f.fecha}` : ""})`,
    url: f.url,
    puntaje: Number((1 - Number(f.distancia)).toFixed(2)),   // similitud coseno: 1 = idéntico, 0 = nada que ver
  };
}

/** Los trozos más parecidos a un vector. */
export async function buscarVectores(sql: Sql, embedding: number[], max: number): Promise<FilaVector[]> {
  const filas = await consultar<{ texto: string; titulo: string; fuente: string; fecha: string | null; url: string; distancia: number }>(sql, `
    SELECT texto, titulo, fuente, fecha::text AS fecha, url, embedding <=> $1::vector AS distancia
    FROM trozos ORDER BY embedding <=> $1::vector LIMIT $2`, [`[${embedding.join(",")}]`, max]);
  return filas.map(aFila);
}

/** Varias búsquedas de una vez (para /evaluar): una sola petición a Neon. */
export async function buscarVariosVectores(sql: Sql, embeddings: number[][], max: number): Promise<FilaVector[][]> {
  const filas = await consultar<{ i: number; texto: string; titulo: string; fuente: string; fecha: string | null; url: string; distancia: number }>(sql, `
    SELECT q.i::int AS i, t.texto, t.titulo, t.fuente, t.fecha::text AS fecha, t.url, t.distancia
    FROM unnest($1::text[]) WITH ORDINALITY AS q(e, i)
    CROSS JOIN LATERAL (
      SELECT texto, titulo, fuente, fecha, url, embedding <=> q.e::vector AS distancia
      FROM trozos ORDER BY embedding <=> q.e::vector LIMIT $2) t
    ORDER BY q.i, t.distancia`, [embeddings.map((e) => `[${e.join(",")}]`), max]);
  const salida: FilaVector[][] = embeddings.map(() => []);
  for (const f of filas) salida[f.i - 1].push(aFila(f));
  return salida;
}
