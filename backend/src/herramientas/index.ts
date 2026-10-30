// El registro de herramientas: la lista completa de lo que el agente puede hacer en el mundo.
// Para agregar una herramienta: crear el archivo (ver _plantilla.ts) y sumarla a esta lista.
import type { Herramienta, ContextoHerramienta } from "../tipos";
import { herramientasDelCurso } from "./extra";
import { herramientaUltimoBoletin, herramientaBoletin } from "./ine";
import { herramientaMemoria } from "./memoria";
import { herramientaBuscar } from "./corpus";

export const herramientas: Herramienta[] = [
  herramientaUltimoBoletin,
  herramientaBoletin,
  herramientaBuscar,
  herramientaMemoria,
  // ← las herramientas nuevas se agregan aquí
  ...herramientasDelCurso,   // las que agrega el profesor en cada clase (archivo extra.ts)
];

/** Lo que se le declara al modelo: nombre, descripción y parámetros. Sin código. */
export function declaraciones(lista: Herramienta[] = herramientas) {
  return lista.map((h) => ({ name: h.nombre, description: h.descripcion, parameters: h.parametros }));
}

export async function ejecutarHerramienta(nombre: string, args: Record<string, unknown>, ctx: ContextoHerramienta, lista: Herramienta[] = herramientas): Promise<unknown> {
  const h = lista.find((x) => x.nombre === nombre);
  if (!h) throw new Error(`No existe la herramienta "${nombre}".`);
  return h.ejecutar(args ?? {}, ctx);
}
