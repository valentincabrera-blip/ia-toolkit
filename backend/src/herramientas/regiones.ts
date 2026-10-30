// Herramienta de la clase 8: la tasa de desocupación de una región, desde la tabla de cifras regionales.
// Es una consulta exacta (una fila), no una búsqueda por significado.
import type { Herramienta } from "../tipos";
import { leerRegiones, resolverRegion } from "../datos/regiones";

export const herramientaTasaPorRegion: Herramienta = {
  nombre: "tasa_por_region",
  descripcion:
    "Devuelve la tasa de desocupación de UNA región de Chile (de las 16) en el último trimestre cargado: tasa, variación en doce meses en puntos porcentuales, tasas por sexo si constan, comparación con la tasa nacional, fuente y URL del boletín regional del INE. Úsala siempre que la pregunta nombre una región o su capital. La ENE no entrega cifras por comuna.",
  parametros: {
    type: "object",
    properties: {
      region: { type: "string", description: "La región como la escribió la persona, por ejemplo: Ñuble, RM, Biobío, Santiago." },
    },
    required: ["region"],
  },
  async ejecutar(args, ctx) {
    const pedido = String(args.region ?? "");
    const nombre = resolverRegion(pedido);
    const tabla = await leerRegiones(ctx.env);
    if (!tabla.regiones.length) throw new Error("Este agente todavía no tiene cifras regionales cargadas.");
    if (!nombre) {
      throw new Error(`No reconozco "${pedido}" como una de las 16 regiones. Si es una comuna o ciudad, la ENE no entrega cifras a ese nivel: ofrece la región.`);
    }
    const fila = tabla.regiones.find((f) => f.region === nombre);
    if (!fila) throw new Error(`La región ${nombre} no está en la tabla del trimestre ${tabla.trimestre}.`);
    const diferencia = fila.tasa !== null ? Number((fila.tasa - tabla.nacional.tasa).toFixed(1)) : null;
    return {
      ...fila,
      trimestre: tabla.trimestre,
      fecha_publicacion: tabla.fecha_publicacion,
      nacional: tabla.nacional,
      comparacion: diferencia === null ? "no consta"
        : diferencia === 0 ? "igual a la tasa nacional"
        : `${Math.abs(diferencia).toString().replace(".", ",")} pp. ${diferencia > 0 ? "sobre" : "bajo"} la tasa nacional (${String(tabla.nacional.tasa).replace(".", ",")}%)`,
      via: tabla.via,
    };
  },
};
