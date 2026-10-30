// La memoria del agente vive en un Durable Object (ver ../memoria-durable.ts). Sin memoria, cada corrida
// empezaría de cero y el agente publicaría el mismo boletín todos los días.
// Estas funciones son la única puerta a la memoria: el bucle, las rutas y el MCP usan solo estas.
import type { Borrador, Env, Herramienta } from "../tipos";
import type { EntradaIndice } from "../memoria-durable";

export type { EntradaIndice };

/** Hay un solo objeto de memoria por Worker, siempre con el mismo nombre. */
function memoria(env: Env) {
  return env.MEMORIA.get(env.MEMORIA.idFromName("memoria"));
}

export async function leerUltimoBoletinVisto(env: Env): Promise<number | null> {
  return memoria(env).leerUltimoBoletinVisto();
}

export async function anotarBoletinVisto(env: Env, numero: number): Promise<void> {
  await memoria(env).anotarBoletinVisto(numero);
}

export async function guardarBorrador(env: Env, b: Borrador): Promise<void> {
  await memoria(env).guardarBorrador(b);
}

export async function leerBorradoresCompletos(env: Env): Promise<Borrador[]> {
  return memoria(env).leerBorradoresCompletos();
}

export async function listarBorradores(env: Env): Promise<EntradaIndice[]> {
  return memoria(env).listarBorradores();
}

export async function leerBorrador(env: Env, id: string): Promise<Borrador | null> {
  return memoria(env).leerBorrador(id);
}

export async function publicarNota(env: Env, b: Borrador): Promise<void> {
  await memoria(env).publicarNota(b);
}

export async function leerNotaPublicada(env: Env): Promise<Borrador | null> {
  return memoria(env).leerNotaPublicada();
}

/** El candado de /correr: si 24 personas aprietan el botón a la vez, corre una sola vez. */
export async function tomarCandado(env: Env, ttlSegundos: number): Promise<boolean> {
  return memoria(env).tomarCandado(ttlSegundos);
}

export async function soltarCandado(env: Env): Promise<void> {
  await memoria(env).soltarCandado();
}

/** Herramienta de solo lectura: el modelo puede preguntar qué recuerda el agente. */
export const herramientaMemoria: Herramienta = {
  nombre: "consultar_memoria",
  descripcion: "Consulta la memoria del agente: último boletín visto, borradores recientes y la nota publicada actualmente. No modifica nada.",
  parametros: { type: "object", properties: {} },
  async ejecutar(_args, ctx) {
    const [ultimo, indice, publicada] = await Promise.all([
      leerUltimoBoletinVisto(ctx.env), listarBorradores(ctx.env), leerNotaPublicada(ctx.env),
    ]);
    return {
      ultimoBoletinVisto: ultimo,
      borradoresRecientes: indice.slice(0, 5),
      notaPublicada: publicada ? { id: publicada.id, titulo: publicada.titulo, boletin: publicada.boletin, aprobadoEn: publicada.aprobadoEn } : null,
    };
  },
};
