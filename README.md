# Agente ENE

**Curso "Agentes de IA para periodismo" · Universidad de Chile · 2026**

Un agente de IA que vigila los boletines de empleo del INE. Cuando aparece uno nuevo, lo lee, redacta un
borrador de nota con sus fuentes y lo deja esperando a que una persona del equipo lo apruebe. Tiene una página
pública donde se publica la nota, se le pueden hacer preguntas y se explica cómo funciona. Cada estudiante
tiene su propia copia en internet, y la cambia sin instalar nada: editando archivos en GitHub o pidiéndoselo
a Jules.

## Cómo llega tu agente a internet

![Cómo llega tu agente a internet](docs/img/flujo-despliegue.svg)

## Las piezas del agente

![Las piezas del Agente ENE](docs/img/arquitectura.svg)

## Los cinco pasos de la clase

| # | Paso | Punto de control: abre esto | Debe verse |
|---|---|---|---|
| 1 | **Fork**: en github.com/sil7en/ia-toolkit, botón *Fork* → *Create fork* | `github.com/<tu-usuario>/ia-toolkit` | Tu copia, con las carpetas `backend` y `frontend` |
| 2 | **Backend en Cloudflare**: Create app → tu repo → *Advanced settings* → **Path** = `backend` → Deploy | `https://ia-toolkit.<tu-subdominio>.workers.dev/` | `"estado": "en línea"` y `"modelo": "simulado…"` |
| 3 | **Secretos**: en Cloudflare, Settings → Variables and Secrets: `GEMINI_API_KEY` y `CLAVE_APROBACION` | la misma URL, recargada | `"modelo": "gemini-…"` |
| 4 | **Primera corrida**: abre `/correr?forzar=1` en el navegador | `https://ia-toolkit.<tu-subdominio>.workers.dev/correr?forzar=1` | Un borrador con su `traza`: qué pidió el modelo y qué recibió |
| 5 | **Frontend en Vercel**: Import → **Import single project** en `frontend` → variable `NEXT_PUBLIC_API_URL` → Deploy | `https://<tu-proyecto>.vercel.app` | La portada; *Forzar una corrida*; aprobar en *Borradores*; la nota publicada |

**Guía con capturas de cada pantalla: [docs/PASO_A_PASO.md](docs/PASO_A_PASO.md).** Qué es un fork, un commit
o un pull request: [docs/FLUJO_GIT.md](docs/FLUJO_GIT.md). Cómo pedirle cambios a Jules:
[docs/JULES.md](docs/JULES.md).

## Los tres lugares que vas a editar

1. **El objetivo del agente**: `backend/src/agente/objetivo.md`, el bloque *"Lo que el equipo editorial quiere
   cambiar"*. Una regla, un efecto medible. Al hacer commit, Cloudflare vuelve a desplegar el backend.
2. **La marca**: `frontend/lib/marca.ts` (nombre, lema, equipo) y los colores de `frontend/app/globals.css`.
   Al hacer commit, Vercel vuelve a desplegar el frontend.
3. **El nombre del equipo en el backend**: `backend/wrangler.jsonc`, la línea `"NOMBRE_EQUIPO": "Mi equipo"`.

Para editar: abre el archivo en GitHub, aprieta el lápiz (o la tecla punto `.` para el editor web), cambia el
texto y aprieta **Commit changes**. Para cambios con código (una herramienta nueva), pídeselo a Jules con la
plantilla de issue "Nueva herramienta".

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El build de Cloudflare falla con "Worker name … must match" | En *Project name* se escribió otra cosa que `ia-toolkit` | Créalo de nuevo dejando el nombre que propone Cloudflare: `ia-toolkit` |
| El build de Cloudflare falla, o Cloudflare abre un pull request para "configurar" el proyecto | **Path** quedó en `/` | Worker → Settings → Builds → Root directory = `backend` → Deployments → Retry build |
| El build de Cloudflare falla en la instalación (`npm ci`, `ERESOLVE` o "lock file") | Se borró o cambió `backend/.npmrc`, o se editó `package.json` a mano | Restaurar `.npmrc` (una línea: `legacy-peer-deps=true`) y deshacer el cambio de `package.json` |
| `GET /` dice `"modelo": "simulado (sin clave de Gemini)"` | La clave de Gemini no está en el panel | Settings → Variables and Secrets → Add → Secret `GEMINI_API_KEY` → Deploy |
| Aprobar dice "Clave de aprobación incorrecta" | Falta el secreto `CLAVE_APROBACION` o se escribió distinto | Revisarlo en el panel; se distingue mayúscula de minúscula |
| La portada dice "Falta la variable NEXT_PUBLIC_API_URL" | La variable no está en Vercel | Vercel → Settings → Environment Variables → agregarla → Deployments → ⋯ → Redeploy |
| Vercel falla diciendo que falta `vercel.json` | Se apretó Deploy en la pantalla de *Services* | Importar de nuevo y elegir **Import single project** en la fila `frontend` |
| La portada dice "No pude hablar con el backend en …" | La URL está mal escrita o el backend no está desplegado | Abrir esa URL; debe responder `"estado": "en línea"`. Sin barra final |
| `/correr` responde 409 | Ya hay una corrida en curso | Esperar 20 segundos y repetir |
| La traza dice "INE no respondió; usé el corpus local" | El sitio del INE no respondió desde Cloudflare | Nada: es el plan B previsto, el agente siguió con los boletines conocidos |
| Hice commit y no cambió nada | El despliegue aún corre o falló | Cloudflare: Worker → Deployments / Builds. Vercel: Deployments. Ver el error |
| La marca de un pull request está roja | La CI "Verificar" encontró un error | Abrir *Details*; pedirle a Jules que lo corrija en el mismo pull request |

## El motor del agente

El bucle del agente tiene dos implementaciones, y se elige con la variable `MOTOR` de `backend/wrangler.jsonc`:
`propio` (el bucle de `backend/src/agente/bucle.ts`, para leerlo entero) o `adk` (el Agent Development Kit de
Google, `backend/src/agente/motor-adk.ts`). Las herramientas, la memoria y la traza son las mismas.

**Valor por defecto: `propio`.** En el ensayo del 22-10-2026 los dos motores funcionaron en producción con
Gemini (`gemini-3.6-flash`): 25 s el propio y 26 s el ADK por corrida, con la misma calidad de borrador. Se
deja `propio` porque es el que los estudiantes pueden leer entero.

## Mis direcciones

<!-- Este bloque es tuyo: complétalo después del paso 5. Las actualizaciones del maestro no lo tocan. -->

- Backend: `ia-toolkit.valentin-cabrera.workers.dev`
- Frontend: `ia-toolkit-36nzqz3uv-valentin-f598.vercel.app`
- MCP: `https://ia-toolkit.<tu-subdominio>.workers.dev/mcp`
