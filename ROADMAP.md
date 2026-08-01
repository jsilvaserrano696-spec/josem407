# Roadmap — AXION

> Documento vivo de priorización por versiones. No es una cola de tareas activa: nada de lo que aparece aquí se implementa por el mero hecho de estar listado. Es el mapa que decide **qué se prioriza cuando se decide trabajar en algo**, para dejar de avanzar por tareas sueltas sin orden.

## Cómo leer este documento

- Organizado por versión (0.9 → 1.0 → 1.5 → 2.0), no por función aislada.
- Cada ítem indica su **estado real hoy**, verificado contra el código y el historial de trabajo de este proyecto — no es una lista de deseos genérica:
  - ✅ Hecho — ya implementado y verificado.
  - 🟡 Parcial — implementado en parte, o implementado pero con un cabo suelto conocido.
  - 🔵 Diseñado — hay un documento de diseño, pero cero código.
  - ⬜ No iniciado — ni diseño ni código.
  - 🔍 Por investigar — así lo planteaste tú mismo para la v2.0: no es un compromiso de construir, es una línea a explorar.
- Los ítems marcados **"(añadido)"** no estaban en tu lista original. Los incorporo desde el análisis del proyecto y el trabajo ya realizado en esta sesión, para no perder ninguna idea — no para forzar su inclusión. Son propuestas, descártalos si no encajan.

---

## Versión 0.9 — Estabilidad absoluta

**Objetivo:** que el núcleo de la aplicación sea fiable de punta a punta antes de añadir una sola función nueva.

| Ítem | Estado | Notas |
|---|---|---|
| Flujo de edición estable | ✅ Hecho | Verificado de extremo a extremo con clave real y prueba automatizada, no solo revisión de código (botón → prompt → Gemini → imagen renderizada) |
| Guardado correcto | ✅ Hecho | "Save Image" probado |
| Historial estable | ✅ Hecho | Persistencia JSON, favoritos incluidos |
| Configuración estable | 🟡 Parcial | Persistencia de idioma/clave API/ajustes verificada exhaustivamente (incluso simulando cierre y reapertura real de la app). Sigue **abierto sin resolver** el bug que reportaste de "reemplazo con ratón" en el campo de la clave API — no se pudo reproducir tras pruebas extensas con todas las combinaciones de selección por ratón, pero tampoco quedó descartado como inexistente |
| Reconocimiento de voz funcional | 🟡 Riesgo conocido, no eliminable del todo | Funciona en las pruebas realizadas, pero depende del servicio de voz de Google integrado en Chromium/Electron — es una limitación de plataforma, no algo 100% controlable desde el código de la app. Ya existe una vía de escape prevista y documentada: sustituirlo por una llamada a una API de voz en la nube reutilizando la misma clave de Gemini, sin tocar el resto de la interfaz |
| Registro de errores (debug) | 🟡 Parcial — requiere una decisión tuya | Existe un modo DEBUG temporal (`src/debug/editDebugLogger.js`) creado para diagnosticar el flujo de edición, marcado explícitamente como provisional. Hay dos caminos: **(a)** eliminarlo una vez confirmada la estabilidad, o **(b)** convertirlo en el sistema de logging permanente de esta versión, limpiando las marcas "TEMP DEBUG". Recomiendo (b) — ya cumple casi literalmente lo que pide este punto |
| (añadido) Prefijo técnico de Electron en errores | ⬜ No corregido | Cualquier error lanzado desde un `ipcMain.handle()` llega a la barra de estado con el prefijo `"Error invoking remote method '...'"` añadido automáticamente por Electron. Se identificó durante la depuración de nivel desarrollador pero no se corrigió. Encaja de forma natural en "registro de errores" / calidad de esta versión |
| (añadido) Pruebas automatizadas y lint | ⬜ No iniciado | Señalado en el primer análisis del proyecto: no hay tests ni lint configurados. Para una versión que promete "estabilidad absoluta", es difícil sostener esa promesa sin ninguna red de seguridad automatizada |

---

## Versión 1.0 — Primera versión pública

**Objetivo:** lista para que la use alguien que no sea tú.

| Ítem | Estado | Notas |
|---|---|---|
| Interfaz completamente en español | ✅ Hecho, con una excepción documentada | Sistema de idiomas construido y verificado en vivo (~106 claves, menú nativo incluido). Excepción deliberada: los mensajes de error que vienen directamente de Gemini o de la importación de imágenes se quedan en inglés — decisión explícita, no un olvido |
| Ayuda contextual | ⬜ No iniciado | Nueva |
| Comparador Antes/Después | ⬜ No iniciado | Ya existen los dos paneles Original/Editada lado a lado como base — un comparador real (deslizador, superposición) sería una evolución de eso, no algo desde cero |
| Gestión de proyectos | ⬜ No iniciado | Nueva. Puede apoyarse en el mismo patrón de persistencia JSON en `userData` que ya usan `historyStore.js` y `promptTemplates.js` |
| Favoritos | ✅ **Ya hecho** | Esto ya está implementado por completo, no solo preparado: entradas del historial con marca de favorito y estrella funcional en el panel |
| Rendimiento optimizado | ⬜ No iniciado, pero con un candidato concreto ya identificado | La conversión HEIC→PNG genera payloads base64 grandes (~20 MB+ en fotos de 12 MP) para preservar calidad sin pérdida — es un candidato claro a revisar si el rendimiento se vuelve un problema real |
| (añadido) Icono de la aplicación | ⬜ No iniciado | Falta un `icon.ico` real; sin él, el instalador se genera con el icono por defecto de Electron — poco apropiado para una versión pública |
| (añadido) Auto-actualización | ⬜ No iniciado | `package.json` ya tiene la configuración base de `electron-builder` lista para esto; falta añadir `electron-updater` y decidir dónde publicar las versiones (GitHub Releases u otro) |
| (añadido) Repositorio remoto | ⬜ No iniciado | El repositorio Git sigue siendo solo local en esta máquina. Antes de llamar a algo "versión pública" hace falta decidir dónde vive el código fuera de aquí |

---

## Versión 1.5 — Experiencia avanzada

**Objetivo:** dejar de ser "un editor de una imagen" y empezar a ser un director que combina fuentes.

| Ítem | Estado | Notas |
|---|---|---|
| Modo Matriz | 🔵 Diseñado, sin código | Ver [`MATRIX_REFERENCE_MODE_DESIGN.md`](./MATRIX_REFERENCE_MODE_DESIGN.md) |
| Imagen Referencia | 🔵 Diseñado, sin código | Mismo documento |
| Constructor automático de prompts | 🔵 Diseñado (sección 3 del documento) | Mismo documento — reutiliza el envío multi-imagen que `imageEditor.js` ya soporta hoy |
| Biblioteca personal | ⬜ No iniciado | Relacionado con un extension point ya señalado en `ARCHITECTURE.md`: `promptTemplates.js` ya persiste a disco, solo falta una UI de gestión (crear/editar/borrar) |
| Explicación de cambios realizados por la IA | ⬜ No iniciado | Nueva. Técnicamente viable pidiéndole a Gemini una descripción breve junto con la imagen editada, con el mismo patrón que ya usa el optimizador de prompts |
| (añadido) Edición por lotes | ⬜ No iniciado, pero ya preparado en el backend | `imageEditor.editImage()` ya acepta varias imágenes a la vez — falta solo la UI. Encaja aquí si no se prioriza antes |

---

## Versión 2.0 — IA colaborativa (a investigar, no a comprometer)

**Objetivo:** líneas de investigación, tal como tú mismo las planteaste — no compromisos de construcción.

| Ítem | Estado | Notas |
|---|---|---|
| Múltiples imágenes | 🔍 Por investigar | Se solapa en parte con el Modo Matriz de 1.5 (que ya es "varias imágenes con roles") — vale la pena aclarar en su momento si esto es lo mismo o algo adicional (p. ej. edición por lotes real, no solo composición) |
| Memoria de estilos | 🔍 Por investigar | Nueva |
| Perfiles de trabajo | 🔍 Por investigar | Nueva |
| Aprendizaje de preferencias del usuario | 🔍 Por investigar | Nueva — implica decisiones de privacidad/almacenamiento a definir antes de diseñar nada |
| Selección automática del mejor modelo de IA | 🔍 Por investigar | AXION 1.1.5 usa Nano Banana 2 (`gemini-3.1-flash-image`) como modelo fijo, sin selector. La investigación futura consiste en decidir automáticamente entre modelos cuando exista una ventaja real; Nano Banana 2 ya está operativo. |

---

## Ideas aparcadas (sin versión asignada)

**No implementar todavía.** A diferencia de las tablas anteriores, estas ideas no están triadas en ninguna versión — es intencionadamente una zona de espera, no un compromiso de que aparezcan en 1.5 o 2.0. Se listan para no perderlas, punto.

- **Memoria de estilos** — también aparece en v2.0 tal cual; se mantiene aquí también porque la marcaste como aparcada, no como parte ya asumida del roadmap versionado.
- **Biblioteca de materiales** — conecta con "Imagen Materiales", ya mencionada como posible rol futuro en [`MATRIX_REFERENCE_MODE_DESIGN.md`](./MATRIX_REFERENCE_MODE_DESIGN.md) (junto a Estilo y Texturas). Si el Modo Matriz de v1.5 sale adelante, esta idea tendría un hueco natural ya preparado ahí.
- **Storyboard** — idea nueva, sin ninguna base previa en el proyecto ni en el código actual.
- **Ramas de edición** — idea nueva. Conceptualmente roza el Modo Conversación actual (que ya mantiene una sesión de turnos por imagen), pero "ramas" implicaría poder bifurcar esa sesión en variantes distintas — algo que hoy no existe ni está preparado.
- **Director de escena** — idea nueva. Enlaza directamente con el lema que motivó el Modo Matriz + Referencia: que la app deje de ser "solo un editor" y combine varias fuentes con criterio.
- **Selección automática del modelo** — también aparece en v2.0 tal cual ("Selección automática del mejor modelo de IA"); hoy no existe selector y AXION utiliza un único modelo fijo, Nano Banana 2 (`gemini-3.1-flash-image`).

---

## Nota de proceso

A partir de ahora, cuando propongas o yo proponga trabajar en algo nuevo, lo situamos primero en este documento (o confirmamos que ya está) antes de tocar código — así el desarrollo queda ordenado por versión y no por ocurrencia del momento.
