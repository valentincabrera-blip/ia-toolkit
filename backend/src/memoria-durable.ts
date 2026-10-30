// LA MEMORIA DEL AGENTE: un Durable Object con una pequeña base de datos SQLite adentro.
// Un Durable Object es un "objeto con disco" que vive en Cloudflare: hay uno solo por Worker (se llama
// "memoria") y guarda qué boletín vio el agente, los borradores y la nota publicada. A diferencia de KV,
// no necesita un id creado a mano: el fork se despliega en cualquier cuenta sin editar nada.
// Las herramientas no hablan con esta clase directamente: usan las funciones de herramientas/memoria.ts.
import { DurableObject } from "cloudflare:workers";
import type { Borrador, Env } from "./tipos";

export interface EntradaIndice {
  id: string; creado: string; titulo: string; estado: Borrador["estado"]; motivo: Borrador["motivo"]; boletin?: number; problemas: number;
}

const CLAVE_ULTIMO = "ultimo_boletin_visto";
const CLAVE_PUBLICADA = "nota_publicada";
const CLAVE_CANDADO = "candado_corrida";

export class Memoria extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Dos tablas: "estado" (clave → valor) y "borradores" (uno por fila, el borrador completo en json).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS estado (clave TEXT PRIMARY KEY, valor TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS borradores (id TEXT PRIMARY KEY, creado TEXT, estado TEXT, json TEXT)`);
  }

  private leer(clave: string): string | null {
    const filas = this.sql.exec<{ valor: string }>(`SELECT valor FROM estado WHERE clave = ?`, clave).toArray();
    return filas[0]?.valor ?? null;
  }

  private escribir(clave: string, valor: string): void {
    this.sql.exec(`INSERT OR REPLACE INTO estado (clave, valor) VALUES (?, ?)`, clave, valor);
  }

  leerUltimoBoletinVisto(): number | null {
    const v = this.leer(CLAVE_ULTIMO);
    return v ? Number(v) : null;
  }

  anotarBoletinVisto(numero: number): void {
    const actual = this.leerUltimoBoletinVisto();
    if (actual === null || numero > actual) this.escribir(CLAVE_ULTIMO, String(numero));
  }

  guardarBorrador(b: Borrador): void {
    this.sql.exec(`INSERT OR REPLACE INTO borradores (id, creado, estado, json) VALUES (?, ?, ?, ?)`, b.id, b.creado, b.estado, JSON.stringify(b));
  }

  leerBorrador(id: string): Borrador | null {
    const filas = this.sql.exec<{ json: string }>(`SELECT json FROM borradores WHERE id = ?`, id).toArray();
    return filas[0] ? (JSON.parse(filas[0].json) as Borrador) : null;
  }

  /** Los 30 borradores más recientes, completos (para /exportar.csv). */
  leerBorradoresCompletos(): Borrador[] {
    return this.sql.exec<{ json: string }>(`SELECT json FROM borradores ORDER BY creado DESC LIMIT 30`).toArray().map((f) => JSON.parse(f.json) as Borrador);
  }

  /** Los 30 borradores más recientes, sin la traza (solo lo que muestra el índice). */
  listarBorradores(): EntradaIndice[] {
    const filas = this.sql.exec<{ id: string; creado: string; estado: string; titulo: string; motivo: string; boletin: number | null; problemas: number }>(
      `SELECT id, creado, estado,
              json_extract(json, '$.titulo') AS titulo,
              json_extract(json, '$.motivo') AS motivo,
              json_extract(json, '$.boletin') AS boletin,
              json_array_length(json, '$.problemas') AS problemas
         FROM borradores ORDER BY creado DESC LIMIT 30`,
    ).toArray();
    return filas.map((f) => ({
      id: f.id, creado: f.creado, titulo: f.titulo, estado: f.estado as Borrador["estado"], motivo: f.motivo as Borrador["motivo"],
      boletin: f.boletin ?? undefined, problemas: f.problemas ?? 0,
    }));
  }

  publicarNota(b: Borrador): void {
    this.escribir(CLAVE_PUBLICADA, JSON.stringify(b));
  }

  leerNotaPublicada(): Borrador | null {
    const v = this.leer(CLAVE_PUBLICADA);
    return v ? (JSON.parse(v) as Borrador) : null;
  }

  /** Candado de la corrida: true si lo tomó, false si ya había otra corrida en curso (y no ha vencido). */
  tomarCandado(ttlSegundos: number): boolean {
    const vence = Number(this.leer(CLAVE_CANDADO) ?? 0);
    if (vence > Date.now()) return false;
    this.escribir(CLAVE_CANDADO, String(Date.now() + ttlSegundos * 1000));
    return true;
  }

  soltarCandado(): void {
    this.sql.exec(`DELETE FROM estado WHERE clave = ?`, CLAVE_CANDADO);
  }
}
