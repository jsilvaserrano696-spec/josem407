# Filosofía de Diseño de AXION

> Documento vivo. Se actualiza cuando cambian los principios de producto, no cuando cambia el código — el código se ajusta a esto, no al revés. Cualquier decisión de diseño de aquí en adelante (funciones nuevas, mensajes, errores, modo desarrollador) se evalúa contra este documento antes de implementarse.

## Declaración de principio

AXION debe sentirse como un producto terminado, no como una demostración de lo que la IA es capaz de hacer. El usuario interactúa con una herramienta de edición de imágenes que responde a lenguaje natural — nunca con "una app que usa Gemini". Todo lo que delate el andamiaje técnico (nombres de modelos, formatos de archivo, JSON, tokens, prompts en inglés, códigos de error HTTP) es, por definición, un defecto de producto, no un detalle de implementación neutro.

## La pregunta que precede a cualquier cambio

Antes de construir, mostrar o exponer nada nuevo:

**¿Esto hace que usar AXION sea más fácil, más rápido o más agradable?**

- Si la respuesta es sí → se construye, y se traduce a los términos de este documento.
- Si la respuesta es no, o es "lo hace más potente pero no más fácil" → se busca la alternativa más simple antes de escribir código. Añadir una función no es nunca el objetivo; que el uso resulte intuitivo sí lo es.

## Principios

**1. Nada técnico cruza al usuario.**
JSON, códigos de error HTTP, nombres de modelos de IA, formatos de archivo (PCM, WAV, WebM…), tokens, prompts en inglés, trazas de log — ninguno de estos conceptos existe para el usuario. Si un dato es necesario para depurar, vive exclusivamente en modo desarrollador.

**2. Un solo idioma para el usuario: español natural.**
Todo lo que el usuario lee o escucha —estados, botones, errores, resultados— está en español, sin tecnicismos, sin importar en qué idioma razone el modelo internamente o qué prompts se construyan entre bambalinas.

**3. Estados, no procesos.**
El usuario no necesita saber que existe un optimizador de prompts, una llamada IPC, un modelo de texto y otro de imagen. Necesita saber en qué fase reconocible de un proceso está. Toda nueva capacidad técnica se traduce a un estado de este vocabulario — no se inventa un mensaje nuevo por cada subsistema:

  - **Escuchando…**
  - **Interpretando tu petición…**
  - **Preparando la edición…**
  - **Generando imagen…**
  - **Edición completada.**

  Los errores siguen la misma regla: una frase natural y accionable ("Revisa tu clave de acceso en Ajustes", "Inténtalo de nuevo"), nunca el detalle crudo de por qué falló técnicamente.

**4. La frontera de depuración es explícita y deliberada.**
Todo dato técnico sigue existiendo — para quien lo necesite. Pero vive detrás de una puerta consciente (modo desarrollador), nunca como parte del camino normal, y nunca "por accidente" (p. ej. un mensaje de error que alguien olvidó traducir, o un menú de DevTools visible por defecto).

**5. Sencillez antes que funcionalidad.**
Ante dos formas de resolver algo, gana la que el usuario entiende sin pensar, no la que expone más control. Una función más pequeña y coherente con el resto de AXION es preferible a una más completa que rompa el tono o el nivel de detalle del resto de la app.

**6. Cada mensaje visible es una promesa de tiempo y de sentido.**
Un estado como "Generando imagen…" le dice al usuario qué está pasando y qué esperar, en sus términos. Si algo tarda más de lo normal, el mensaje se mantiene natural y honesto — nunca se convierte en un detalle de reintento o conexión.

## El vocabulario no crece por sistema, crece por experiencia

Cuando se añada una función nueva (voz, edición, historial, lo que sea), la pregunta no es "¿qué le digo al usuario sobre este subsistema?" sino "¿en cuál de las fases ya reconocibles (escuchando / interpretando / preparando / generando / completado) encaja esto, o hace falta una fase nueva que se sienta igual de natural que las demás?". El vocabulario de estados es deliberadamente corto — se amplía con cautela, no una vez por función.

## Modo desarrollador

Existe un único lugar donde lo técnico es visible: un modo desarrollador oculto, de activación deliberada (nunca accesible por accidente ni presente en el uso normal). Ahí, y solo ahí, pueden vivir:

- El prompt real enviado a Gemini (incluido el texto en inglés generado internamente).
- Respuestas crudas de la API, códigos de estado, tiempos de respuesta.
- Logs técnicos y trazas de error.
- Acceso a herramientas de desarrollador (DevTools).

Nada de esto aparece en el modal de Ajustes normal ni en ningún menú visible por defecto.

## Checklist antes de añadir cualquier cosa nueva

1. ¿El usuario ve algo nuevo? → Debe estar en español natural y encajar en el vocabulario de estados existente (o justificar por qué necesita uno nuevo).
2. ¿Esto le pide una decisión técnica al usuario? → Si podemos decidirlo por él sin perder control real, se decide por él.
3. ¿Hay algún dato técnico en el camino feliz (JSON, formatos, nombres de modelo, códigos de error)? → Se mueve a modo desarrollador.
4. ¿Esto hace AXION más simple de usar, o solo más capaz? → Si es solo "más capaz", se replantea antes de construirlo.

## Especificación de aplicación (auditoría técnica → vocabulario AXION)

Traducción concreta de cada punto pendiente de la auditoría de información técnica a este documento. Todavía sin código — esto es la referencia para implementar después.

### Estados

| Momento | Antes (técnico) | Ahora |
|---|---|---|
| Grabando la voz | "Escuchando…" | **Escuchando…** (sin cambio) |
| Procesando el audio grabado | "Transcribiendo…" | **Interpretando tu petición…** |
| Pulsar "Mejorar Prompt" / auto-optimización | "Mejorando prompt…", y el prompt en inglés sustituía el texto visible | **Interpretando tu petición…** — el texto que el usuario ve y puede seguir editando no cambia; el prompt optimizado se usa solo internamente para la llamada a Gemini |
| Preparando la edición (fusión de estilo, prompt final) | no existía como fase propia | **Preparando la edición…** |
| Generando la imagen editada (la llamada real, la espera larga) | "Editando imagen…" cubría todo el proceso de golpe | **Generando imagen…** |
| Edición terminada | "Edición completada." | **Edición completada.** (sin cambio) |

### Errores

Todos genéricos, accionables, sin marca ni detalle técnico. El detalle real (causa, nombre de archivo, código HTTP, nombre de modelo) se sigue registrando, pero solo en modo desarrollador.

| Escenario | Antes (técnico) | Ahora |
|---|---|---|
| Sin clave de acceso configurada | "Add your Gemini API key in Settings…" | "Añade tu clave de acceso en Ajustes para empezar." |
| Clave inválida o rechazada | "Gemini rejected the request (401)… it should start with 'AIzaSy'…" | "Tu clave de acceso no es válida. Revísala en Ajustes." |
| Fallo genérico de la API | "Gemini request failed (500): {detalle crudo}" | "Algo no ha salido bien. Inténtalo de nuevo." |
| El modelo no devolvió una imagen | "Model responded with text instead of an image: …" | "No se ha podido generar la imagen. Inténtalo de nuevo." |
| Formato de imagen no soportado | "Unsupported image format \"xyz\" for \"foto.xyz\". Supported formats: …" | "Ese tipo de archivo no es compatible. Prueba con una imagen en JPG, PNG, WebP o HEIC." |
| Fallo al convertir HEIC/HEIF | "Could not convert \"foto.heic\" (HEIC)… may be corrupted or use an unsupported variant." | "No se ha podido abrir esta imagen. Puede estar dañada o en un formato no compatible." |
| Sin voz detectada / micrófono denegado | ya en español natural | sin cambio |

### Modo desarrollador — mecanismo propuesto

- Atajo de teclado oculto (p. ej. `Ctrl+Shift+Alt+D`), sin botón ni entrada de menú visible por defecto. Alterna un flag `developerMode` persistido, que nunca aparece en el modal de Ajustes normal.
- Con el modo activo: aparece "Herramientas de desarrollador" en el menú Ver, y se revela el detalle técnico de errores/prompts en el registro de depuración existente.
- El enlace "Documentación de la API" del menú Ayuda se **elimina** del menú (decisión tomada: simplicidad sobre disponibilidad — quien necesite esa referencia técnica ya está en modo desarrollador o no es el usuario al que le habla este menú).
- Con el modo desactivado (estado por defecto siempre): nada de esto es visible ni alcanzable por accidente.

Especificación cerrada, sin puntos abiertos.
