// Cómo habla el frontend con el backend. Una sola constante define dónde vive el agente.
// NEXT_PUBLIC_API_URL se configura en Vercel (Settings → Environment Variables) y se lee al construir la
// página: si se cambia, hay que volver a desplegar (Deployments → ⋯ → Redeploy).
export const API_CONFIGURADA = Boolean(process.env.NEXT_PUBLIC_API_URL);
export const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

export interface Cifra { nombre: string; valor: string; variacion?: string; fuente: string }
export interface Paso { n: number; tipo: string; detalle: string; ms?: number; datos?: unknown }
export interface Borrador {
  id: string; estado: "pendiente" | "aprobado" | "rechazado"; creado: string; motivo: string; boletin?: number;
  titulo: string; bajada: string; cuerpo: string; cifras: Cifra[]; fuentes: string[]; problemas: string[];
  modelo: string; traza: Paso[]; aprobadoPor?: string; aprobadoEn?: string;
}
export interface EntradaIndice { id: string; creado: string; titulo: string; estado: Borrador["estado"]; motivo: string; boletin?: number; problemas: number }
export interface Inventario { nombre: string; equipo: string | null; estado: string; modelo: string; ultimoBoletinVisto: number | null; herramientas: { nombre: string; descripcion: string }[] }

export interface Region {
  region: string; codigo: string; tasa: number | null; variacion_pp: number | null;
  tasa_hombres: number | null; tasa_mujeres: number | null; informalidad: number | null; fuente: string; url: string;
}
export interface Regiones {
  trimestre: string; fecha_publicacion: string; boletin: number;
  nacional: { tasa: number; variacion_pp: number; fuente: string; url: string }; regiones: Region[];
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<{ ok: boolean; status: number; datos: T }> {
  const r = await fetch(`${API}${ruta}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const datos = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, status: r.status, datos };
}

export const api = {
  inventario: () => pedir<Inventario>("/"),
  nota: () => pedir<Borrador | { mensaje: string }>("/nota"),
  borradores: () => pedir<EntradaIndice[]>("/borradores"),
  borrador: (id: string) => pedir<Borrador>(`/borradores/${id}`),
  correr: (cuerpo: { forzar?: boolean; boletin?: number } = {}) => pedir<Borrador | { sinNovedad: true; motivo: string; traza: Paso[] } | { error: string }>("/correr", { method: "POST", body: JSON.stringify(cuerpo) }),
  decidir: (accion: "aprobar" | "rechazar", id: string, nombre: string, clave: string) =>
    pedir<{ ok?: boolean; error?: string }>(`/${accion}`, { method: "POST", body: JSON.stringify({ id, nombre }), headers: { "x-clave": clave } }),
  preguntar: (pregunta: string) => pedir<{ respuesta: string; fuentes: string[]; modelo: string; via?: "vector" | "local" | "tabla" | null; traza: Paso[] } | { error: string }>("/preguntar", { method: "POST", body: JSON.stringify({ pregunta }) }),
  regiones: () => pedir<Regiones | { error: string }>("/regiones"),
};

export const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }) : "");
