// Tipos compartidos por todo el backend. Leer este archivo es leer el vocabulario del agente.
import type { Memoria } from "./memoria-durable";

/** Lo que Cloudflare le entrega al Worker en cada ejecución: memoria, IA, secretos y variables. */
export interface Env {
  MEMORIA: DurableObjectNamespace<Memoria>; // la memoria del agente (Durable Object con SQLite)
  AI: Ai;                          // Workers AI: convierte el PDF del INE a texto
  GEMINI_API_KEY?: string;         // secreto
  CLAVE_APROBACION?: string;       // secreto
  DATABASE_URL?: string;           // secreto (clase 8): la cadena de conexión a Neon, donde vive el RAG propio
  NOMBRE_EQUIPO?: string;
  GEMINI_MODELOS?: string;         // lista separada por comas, en orden de preferencia
  MAX_PASOS?: string;
  MOTOR?: string;                  // "propio" (el bucle de bucle.ts) o "adk" (Google ADK, motor-adk.ts)
}

/** Una herramienta: algo que el agente puede pedir que se ejecute. El modelo no la ejecuta; el programa sí. */
export interface Herramienta {
  nombre: string;
  descripcion: string;                               // el modelo decide con esto cuándo usarla
  parametros: EsquemaJson;                           // qué argumentos acepta (JSON Schema)
  ejecutar(args: Record<string, unknown>, ctx: ContextoHerramienta): Promise<unknown>;
}

export interface ContextoHerramienta {
  env: Env;
  traza: PasoTraza[];
}

export interface EsquemaJson {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
}

/** Un paso de la traza: la bitácora de lo que el agente pensó, pidió y recibió. */
export interface PasoTraza {
  n: number;
  tipo: "encargo" | "modelo" | "herramienta" | "resultado" | "limite" | "fin" | "error";
  detalle: string;
  datos?: unknown;
  ms?: number;
}

export interface Cifra {
  nombre: string;         // "tasa de desocupación nacional"
  valor: string;          // "9,6%"
  variacion?: string;     // "+1,0 pp. en doce meses"
  fuente: string;         // "Boletín ENE n.º 335, INE, 30-09-2026"
}

export interface Borrador {
  id: string;
  estado: "pendiente" | "aprobado" | "rechazado";
  creado: string;         // ISO
  motivo: "manual" | "cron" | "pregunta";
  boletin?: number;
  titulo: string;
  bajada: string;
  cuerpo: string;
  cifras: Cifra[];
  fuentes: string[];
  problemas: string[];    // lo que detectaron los límites
  modelo: string;
  traza: PasoTraza[];
  aprobadoPor?: string;
  aprobadoEn?: string;
}

export interface ResumenBoletin {
  numero: number;
  url: string;
  fecha?: string;
  trimestre?: string;
  tasa?: string;                 // "9,6%"
  variacionPp?: string;          // "1,0"
  desocupados?: string;
  inactivos?: string;
  texto: string;                 // texto (recortado) del boletín
  origen: "INE en vivo" | "corpus local del curso";
}
