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
| Registro de errores (debug) | ✅ Hecho | El diagnóstico se conserva como infraestructura permanente y solo escribe cuando el usuario activa explícitamente el Modo Desarrollador; el uso normal no registra prompts ni detalles internos |
| (añadido) Prefijo técnico de Electron en errores | ✅ Hecho | El puente preload normaliza centralmente los errores de todos los canales IPC y conserva solo el mensaje útil para la interfaz |
| (añadido) Pruebas automatizadas y lint | ✅ Hecho | Hay 267 pruebas automatizadas, ESLint con reglas oficiales y un único control `npm run check`; todo está en verde |

---

## Versión 1.0 — Primera versión pública

**Objetivo:** lista para que la use alguien que no sea tú.

| Ítem | Estado | Notas |
|---|---|---|
| Interfaz completamente en español | ✅ Hecho, con una excepción documentada | Sistema de idiomas construido y verificado en vivo (~106 claves, menú nativo incluido). Excepción deliberada: los mensajes de error que vienen directamente de Gemini o de la importación de imágenes se quedan en inglés — decisión explícita, no un olvido |
| Ayuda contextual | ✅ Hecho | Mensajes bilingües breves aparecen al situar el ratón o el foco sobre Matriz, Referencia, Comparar, Modo conversación e identidad del diseño |
| Comparador Antes/Después | ✅ Hecho | La vista ampliada ofrece Original, Editada y una superposición interactiva con deslizador horizontal, teclado, porcentaje exacto, escala Editada/Original y zoom sincronizado hasta 800 % con herramienta Mano automática |
| Edición protegida | 🟡 Experimental | La versión 1.1.31 quedó validada con Varita, zoom, Mano, deshacer/rehacer y composición local sobre una imagen 4K real. El puntero fino de 1 px añadido en 1.1.32 queda en observación: falta reproducir el fallo descrito como «la magia no funciona» y medir el comportamiento con archivos pesados antes de declararlo estable |
| Gestión de proyectos | ✅ Hecho | AXION recupera el proyecto activo y su ruta entre reinicios, permite guardar/abrir archivos `.axion`, actualizarlos con `Ctrl+S` y abrirlos con doble clic desde Windows |
| Favoritos | ✅ **Ya hecho** | Esto ya está implementado por completo, no solo preparado: entradas del historial con marca de favorito y estrella funcional en el panel |
| Rendimiento optimizado | 🟡 Parcial, núcleo 4K medido | La Varita recorrió una selección completa de 3840×2160 (8,29 Mpx) en ~219 ms, el pincel de 100 px en ~8 ms y la composición en ~95 ms. El historial de selección ahora usa índices para cambios pequeños y un mapa compacto para áreas grandes, evitando duplicar millones de índices. Queda medir el flujo HEIC→PNG y la experiencia completa dentro de Electron con archivos pesados |
| (añadido) Icono de la aplicación | ✅ Hecho | `assets/icons/icon.ico` está integrado tanto en la ventana como en el ejecutable y los instaladores de Windows |
| (añadido) Firma de código para Windows | ⬜ No iniciado, bloquea publicación confiable | `Get-AuthenticodeSignature` confirma que `AXION.exe` y el instalador 1.1.33 están `NotSigned`. Hace falta un certificado de firma de código asociado a la identidad legal del editor; hasta entonces Windows SmartScreen puede mostrar advertencias |
| (añadido) Auto-actualización | ⬜ No iniciado | `package.json` ya tiene la configuración base de `electron-builder` lista para esto; falta añadir `electron-updater` y decidir dónde publicar las versiones (GitHub Releases u otro) |
| (añadido) Repositorio remoto | ⬜ No iniciado | El repositorio Git sigue siendo solo local en esta máquina. Antes de llamar a algo "versión pública" hace falta decidir dónde vive el código fuera de aquí |

---

## Versión 1.5 — Experiencia avanzada

**Objetivo:** dejar de ser "un editor de una imagen" y empezar a ser un director que combina fuentes.

| Ítem | Estado | Notas |
|---|---|---|
| Modo Matriz | ✅ Hecho | Implementado de extremo a extremo con interfaz de roles y pipeline multi-imagen |
| Imagen Referencia | ✅ Hecho | Implementada con separación estricta entre contenido de la matriz y atributos visuales de la referencia |
| Constructor automático de prompts | ✅ Hecho | `matrixPromptBuilder.js` construye el protocolo determinista y está cubierto por pruebas automatizadas |
| Biblioteca personal | ✅ Hecho | La barra lateral y su gestor integrado permiten guardar el prompt actual, reutilizarlo, editarlo y borrarlo. La persistencia es atómica, valida límites y protege las plantillas incluidas de modificación o borrado |
| Explicación de cambios realizados por la IA | ✅ Hecho | Gemini devuelve una explicación breve junto con la imagen en la misma llamada; AXION la muestra bajo el resultado y la conserva en cada versión del proyecto, con compatibilidad para proyectos antiguos |
| (añadido) Edición por lotes | 🔍 Por investigar | El backend procesa una imagen matriz por llamada; el Modo Matriz aporta referencias con roles, no un lote de salidas independientes. Antes de implementarlo hay que definir selección, carpeta/nombres de salida, progreso, cancelación y política ante fallos parciales |

---

## Versión 2.0 — IA colaborativa (a investigar, no a comprometer)

**Objetivo:** líneas de investigación, tal como tú mismo las planteaste — no compromisos de construcción.

| Ítem | Estado | Notas |
|---|---|---|
| Múltiples imágenes | 🔍 Por investigar | Se solapa en parte con el Modo Matriz de 1.5 (que ya es "varias imágenes con roles") — vale la pena aclarar en su momento si esto es lo mismo o algo adicional (p. ej. edición por lotes real, no solo composición) |
| Memoria de estilos | 🟡 Base implementada | AXION recuerda localmente los cuatro estilos usados más recientemente y los prioriza sin analizar prompts ni contenido. Un aprendizaje semántico de preferencias, si se desea, sigue pendiente de diseño y privacidad |
| Perfiles de trabajo | ✅ Hecho | Ajustes permite guardar hasta 20 perfiles con nombre, aplicar o eliminar combinaciones de estilo inicial y Modo conversación. Se aplican a proyectos nuevos sin incluir claves, idioma ni contenido de proyectos |
| Aprendizaje de preferencias del usuario | 🔍 Límite definido | `PRIVACY.md` prohíbe inferencia silenciosa sobre prompts o imágenes. La memoria actual usa solo estilos recientes y perfiles explícitos locales; cualquier aprendizaje semántico futuro deberá ser opt-in, explicable y borrable |
| Selección del modelo de IA | ✅ Control explícito hecho | AXION empieza en Ahorro (Flash Lite, 1K) y permite elevar manualmente a Equilibrado (Flash, 4K) o Pro (4K), mostrando costes aproximados. Los perfiles recuerdan el nivel y cada versión registra el modelo usado. No hay subidas ni reintentos de pago silenciosos |

---

## Ideas aparcadas (sin versión asignada)

**No implementar todavía.** A diferencia de las tablas anteriores, estas ideas no están triadas en ninguna versión — es intencionadamente una zona de espera, no un compromiso de que aparezcan en 1.5 o 2.0. Se listan para no perderlas, punto.

- **Memoria de estilos** — también aparece en v2.0 tal cual; se mantiene aquí también porque la marcaste como aparcada, no como parte ya asumida del roadmap versionado.
- **Biblioteca de materiales** — ya tiene una primera base discreta en `Archivo → Datos del proyecto…`: cada proyecto puede conservar nombre de diseño y referencia comercial, y utiliza esa identidad al exportar sin ocupar el espacio principal. Sigue pendiente el catálogo de múltiples materiales, los bloqueos de fidelidad y la ficha técnica de impresión.
- **Storyboard** — idea nueva, sin ninguna base previa en el proyecto ni en el código actual.
- **Ramas de edición** — idea nueva. Conceptualmente roza el Modo Conversación actual (que ya mantiene una sesión de turnos por imagen), pero "ramas" implicaría poder bifurcar esa sesión en variantes distintas — algo que hoy no existe ni está preparado.
- **Director de escena** — idea nueva. Enlaza directamente con el lema que motivó el Modo Matriz + Referencia: que la app deje de ser "solo un editor" y combine varias fuentes con criterio.
- **Selección automática del modelo** — el selector manual y auditable ya está hecho. Un enrutado automático sigue aparcado: solo se considerará si es opt-in, explicable y nunca eleva el gasto silenciosamente.

---

## Nota de proceso

A partir de ahora, cuando propongas o yo proponga trabajar en algo nuevo, lo situamos primero en este documento (o confirmamos que ya está) antes de tocar código — así el desarrollo queda ordenado por versión y no por ocurrencia del momento.
