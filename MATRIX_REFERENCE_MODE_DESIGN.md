# Diseño: Modo Matriz + Referencia

> **Estado: propuesta de diseño, sin implementar.** Este documento define la arquitectura antes de escribir ningún código. No modifica el comportamiento actual de la aplicación.
>
> **Nota:** el mecanismo base de este diseño —enviar varias imágenes en una misma llamada, cada una con un rol explícito señalado por texto— ya tiene una primera implementación real, aunque para un propósito distinto al descrito aquí: el "ancla de fidelidad" de `src/gemini/imageEditor.js` (ver `ARCHITECTURE.md`, sección "Fidelity anchor"), donde la imagen original se envía junto a la actual para frenar el deterioro acumulado de identidad. Este documento sigue sin implementar su propuesta de roles múltiples para composición (Matriz/Referencia como tal); solo el mecanismo de transporte de varias imágenes ya se usa en producción.

## 0. Visión

Hoy AXION edita **una** imagen a partir de **un** prompt de texto. El Modo Matriz + Referencia la convierte en un compositor multi-fuente: el usuario aporta varias imágenes, cada una con un **rol** explícito, y la app construye automáticamente las instrucciones necesarias para que Gemini combine esas fuentes en un único resultado coherente — sin que el usuario tenga que saber nada de *prompt engineering*.

La pieza central del diseño es esta: **el sistema de roles es una capa de datos + texto, no una capa de UI ni de protocolo IPC.** Eso es lo que permite que sea sencillo para el usuario, extensible a futuros roles, y resistente a cambios de modelo — los tres requisitos que pides en los puntos 1, 2 y 5 son, en el fondo, la misma decisión de arquitectura vista desde tres ángulos distintos.

---

## 1. Flujo de trabajo del usuario

### Principio rector: el caso simple no cambia

Un usuario que solo quiere editar una imagen (el 90% del uso actual) **no ve nada nuevo**. Arrastra su imagen al panel Original exactamente como hoy, escribe un prompt, pulsa Editar Imagen. El Modo Matriz + Referencia es **estrictamente aditivo y opcional** — esto no es una preferencia de diseño, es una restricción dura: nada de lo que ya funciona puede degradarse.

### Flujo con Referencia

1. El usuario carga la imagen principal exactamente como hoy (drag&drop, Browse, o "Add Image"). Internamente esa imagen ya *es* la Matriz — no hace falta que el usuario la etiquete, es la asignación por defecto y la única obligatoria.
2. Aparece, junto al panel Original, una fila de "ranuras de rol" (ver sección 2) — hoy vacía salvo la Matriz ya rellena.
3. El usuario pulsa "+ Referencia" (o arrastra una segunda imagen directamente a esa ranura). Se abre el mismo selector de archivos de siempre.
4. La ranura de Referencia muestra una miniatura + su icono de rol. El usuario puede quitarla (×) en cualquier momento sin afectar a la Matriz.
5. El usuario escribe su prompt normal ("dale el estilo de la segunda imagen", "usa el fondo de la referencia", etc. — lenguaje natural, no una sintaxis especial).
6. Pulsa Editar Imagen. La app construye el prompt interno (sección 3) y envía Matriz + Referencia + texto a Gemini en una sola llamada — el mecanismo de envío multi-imagen **ya existe** en el código actual (`src/gemini/imageEditor.js`, `editImage()` ya acepta `imagePaths: string[]` y ya serializa cada imagen como una parte `inlineData` independiente en el array `messageParts`; hoy la UI solo llena esa lista con un elemento, pero la función no cambia de forma).
7. El resultado aparece en el panel Editada, igual que hoy. El historial guarda qué roles participaron (para poder mostrar "Editado con Referencia" más adelante, sin que sea imprescindible para el MVP).

### Modo Conversación

El modo conversación actual (`activeSessions: Map<sessionId, Chat>`) reenvía todo el historial de turnos automáticamente. Los roles solo se declaran en el **primer turno** (cuando se construye `messageParts` por primera vez); los turnos siguientes son solo texto, exactamente como hoy — el modelo ya tiene las imágenes con sus roles en su contexto de conversación. No se necesita lógica nueva aquí, es una consecuencia directa de cómo ya funciona `Chat.sendMessage()`.

### Quitar/cambiar una imagen a mitad de sesión

Quitar la Referencia no afecta a la Matriz ni reinicia la conversación. Cambiar la Matriz sí reinicia la sesión (mismo comportamiento que hoy al soltar una imagen nueva) — es el ancla de identidad, cambiarla es, conceptualmente, "empezar un edit distinto".

---

## 2. Diseño de la interfaz

### Punto de partida: ya existe el hueco preparado

En un trabajo anterior se dejó preparado exactamente este hueco, sin usarlo todavía: `ui/index.html` tiene un contenedor `#original-gallery` (oculto) dentro del panel Original, y `ui/styles/components.css` ya define `.image-gallery` y `.gallery-thumb` — "*Extension point for a future multi-image gallery... see ARCHITECTURE.md*". Este diseño **es** esa evolución. No hay que inventar un patrón visual nuevo, hay que activar y dar semántica al que ya está.

### Estructura visual propuesta

```
┌─ Panel Original ──────────────────────────────┐
│ Original                                    ➕ │  ← cabecera actual, sin cambios
├─────────────────────────────────────────────────┤
│                                                   │
│              [imagen Matriz grande]              │  ← el "ancla" siempre ocupa
│                                                   │     el visor principal
├─────────────────────────────────────────────────┤
│ 🧬 Matriz  [thumb]  ✕     🎨 + Referencia        │  ← fila de ranuras de rol
└─────────────────────────────────────────────────┘
```

- El **visor principal grande siempre muestra la Matriz** — nunca la Referencia. Esto por sí solo comunica el concepto sin necesidad de leer nada: "la imagen grande es la que se conserva; las pequeñas de abajo son inspiración."
- La fila de ranuras se genera **a partir de una lista de datos** (sección 3), no está hardcodeada por rol — así añadir "Materiales" o "Estilo" en el futuro es una fila más, sin tocar HTML/CSS.
- Cada ranura vacía es un botón fantasma "+ {nombre del rol}" con el mismo lenguaje visual que ya usan `.icon-button`/`.secondary-button` (mismo patrón que 👁/📋 en Settings).
- Cada ranura llena muestra: icono de rol + miniatura (`.gallery-thumb`, ya con estilos) + botón ✕ para quitar.
- **Tooltip de una frase por rol**, no un manual: al pasar el ratón sobre el icono de un rol (lleno o vacío), un `title`/`aria-label` explica su función en una frase — el mismo mecanismo `data-i18n-title` ya usado en toda la app. P. ej.: Matriz → "Se mantiene: identidad, forma, persona u objeto base." · Referencia → "Aporta inspiración: estilo, luz, fondo, colores o ropa."
- Iconografía propuesta (placeholder, discutible): 🧬 Matriz (identidad/ADN), 🎨 Referencia (paleta/inspiración). Deben ser visualmente distintos a simple vista y no chocar con los iconos de estilo ya existentes en la librería de estilos.

### Por qué el visor grande = Matriz es la decisión de UX más importante del documento

Es la única señal que un usuario necesita para entender el sistema sin leer nada: *lo grande es lo que se queda igual; lo pequeño es de dónde saco ideas*. Todo lo demás (iconos, tooltips, nombres) es refuerzo, no la explicación principal.

---

## 3. Cómo construir automáticamente el prompt interno

### La restricción real: Gemini no tiene un campo "rol de imagen"

La API multimodal de Gemini acepta una lista de partes (texto + `inlineData` de imagen) sin metadatos de rol adjuntos a cada imagen. El **único** canal disponible para comunicar "esta imagen es la identidad, esta otra es solo inspiración" es el propio texto del prompt, describiendo explícitamente cada imagen por su posición en la lista. Todo el diseño de esta sección parte de esa limitación real, no de una preferencia de arquitectura.

### Módulo de datos: `src/roles/imageRoles.js` (nuevo, cuando se implemente)

Mismo patrón exacto que `src/styles/styleLibrary.js` (datos puros, sin lógica, `{id, label, icon, ...}`):

```js
const IMAGE_ROLES = [
  {
    id: "matrix",
    label: "Matriz",
    icon: "🧬",
    required: true,          // siempre debe haber una
    priority: 0,              // menor = gana en caso de conflicto (ver sección 4)
    scope: ["identity", "subject", "core-shape"],
    modelInstruction:
      "This is the MATRIX image — the base identity. Preserve this person's, object's, or " +
      "element's identity, proportions, and core likeness exactly. This is the anchor of the " +
      "final result and takes priority over every other image.",
  },
  {
    id: "reference",
    label: "Referencia",
    icon: "🎨",
    required: false,
    priority: 10,
    scope: ["style", "lighting", "background", "composition", "color-palette", "clothing"],
    modelInstruction:
      "This is a REFERENCE image — inspiration only. Use it strictly for: style, lighting, " +
      "background, composition, color palette, or clothing, as requested in the instruction " +
      "below. Never let this image's subject or identity replace the MATRIX image's identity.",
  },
  // futuros roles (Materiales, Estilo, Texturas) se añaden aquí, mismo shape.
];
```

### Módulo constructor: `src/prompts/matrixPromptBuilder.js` (nuevo)

Mismo patrón exacto que el ya existente `src/prompts/optimizerPromptBuilder.js` (construcción de string pura, sin llamadas de red, fácilmente testeable). Recibe la lista ordenada de `{role, image}` activos y el prompt del usuario, y devuelve el texto final:

```
You are given 2 reference images, in this exact order:

Image 1 — MATRIX: This is the MATRIX image — the base identity. Preserve this person's,
object's, or element's identity, proportions, and core likeness exactly. This is the anchor
of the final result and takes priority over every other image.

Image 2 — REFERENCE: This is a REFERENCE image — inspiration only. Use it strictly for:
style, lighting, background, composition, color palette, or clothing, as requested in the
instruction below. Never let this image's subject or identity replace the MATRIX image's
identity.

User instruction: "dale el estilo de la segunda imagen a la primera"
```

Puntos clave de diseño de este bloque:

- **El orden es determinista y fijo** (por `priority` en `imageRoles.js`): Matriz siempre es "Image 1", Referencia siempre "Image 2", etc. Gemini correlaciona menciones de texto ("la primera imagen") con la posición real en el array — si el orden no fuera estable, el prompt mentiría sobre qué imagen es cuál.
- **Compone con el optimizador de prompts existente, no lo sustituye.** Cuando "Optimizar siempre los prompts" está activo, `buildOptimizerMetaPrompt()` (ya existente) necesita saber qué roles están activos para no reescribir el prompt de forma que pierda la semántica de roles — se le pasa la misma lista de roles activos como un fragmento adicional, igual que hoy ya recibe `styleFragment`.
- El texto de instrucción de cada rol (`modelInstruction`) es **el mismo para toda la app**, no se le pide al usuario que lo escriba — es exactamente la promesa de "interfaz extremadamente sencilla": el usuario nunca ve ni edita este texto, solo elige qué imagen va en qué ranura.

### Cambio de forma en `imageEditor.js` (cuando se implemente)

`editImage()` pasaría de aceptar `imagePaths: string[]` a aceptar `imageRoles: { role: string, filePath: string }[]`, con `imagePaths` derivable internamente (`imageRoles.map(r => r.filePath)`) para no romper nada del pipeline de importación (`imageImportService.importImage()` no cambia en absoluto — sigue leyendo un path y devolviendo `{base64, mimeType}`, ajeno por completo al concepto de "rol"). Si solo se pasa una imagen sin rol explícito, se asume `matrix` — así el 100% de las llamadas actuales (una sola imagen) siguen siendo válidas sin cambios en las demás capas.

---

## 4. Cómo evitar conflictos cuando dos imágenes aporten información contradictoria

### Jerarquía explícita, no negociación implícita

Cada rol declara un **`scope`**: una lista cerrada de qué atributos tiene permitido influir. Matriz tiene scope `identity` (y nada más, porque su trabajo es *no* cambiar). Referencia tiene un scope amplio pero **explícitamente excluye** identidad — esa exclusión está escrita en su propio `modelInstruction`, no confiada a que el modelo lo intuya.

Esto convierte "evitar conflictos" en una regla mecánica y auditable en vez de una esperanza: si dos imágenes aportan información contradictoria dentro del mismo scope (p. ej., dos roles futuros que ambos reclamaran "iluminación"), el de **menor `priority`** (definido en `imageRoles.js`) gana para ese atributo — es una tabla de datos, no una negociación en tiempo de ejecución.

### ¿Qué pasa si el propio texto del usuario contradice la jerarquía?

Ejemplo límite: el usuario escribe "usa la cara de la segunda imagen en vez de la primera". Aquí se recomienda **no** intentar detectar y resolver esa contradicción de forma automática (heurísticas de NLP para esto son frágiles y añaden complejidad no justificada para un editor con "interfaz extremadamente sencilla"). En su lugar:

- El comportamiento por defecto **prioriza la Matriz siempre**, de forma predecible y sin sorpresas — es una promesa de producto ("lo que pongas en Matriz se conserva"), no un detalle técnico.
- Si el usuario realmente quiere que la otra imagen sea la identidad base, el modelo mental correcto es: *cambia qué imagen está en la ranura Matriz*, no pelear contra el sistema con el texto. Esto es coherente con el principio de la sección 2 (el visor grande = lo que se conserva) — no hace falta una función nueva para resolverlo, la interfaz ya comunica cómo hacerlo.
- Esta decisión se documenta en el tooltip de Matriz ("se mantiene siempre") para que la expectativa esté puesta desde el primer vistazo, no descubierta por sorpresa tras un resultado inesperado.

### Límite honesto que hay que reconocer

Ningún prompt, por bien diseñado que esté, puede **garantizar al 100%** que el modelo respete la jerarquía en todos los casos — es un modelo generativo, no un sistema determinista. El diseño aquí maximiza la probabilidad de que el modelo la respete (instrucciones explícitas, orden estable, exclusiones declaradas), pero no la garantiza. Vale la pena fijar esa expectativa en la propia interfaz de resultado en algún momento (fuera del alcance de este documento), y apoyarse en el modo DEBUG ya existente (`src/debug/editDebugLogger.js`, si sigue presente cuando esto se implemente, o su sucesor) para iterar empíricamente sobre la redacción exacta de `modelInstruction` contra el modelo real — la eficacia de un prompt solo se valida ejecutándolo.

---

## 5. Compatibilidad con futuros modelos de Gemini sin cambiar la experiencia de usuario

### La garantía de fondo: los roles viven en texto + datos, nunca en UI ni en IPC

Ni `ui/index.html`, ni ningún componente de `ui/scripts/`, ni el contrato IPC (`src/shared/ipcChannels.js`) necesitan saber nada sobre cómo se le comunica un rol a un modelo concreto. La UI solo trabaja con el concepto abstracto "ranura de rol" (id, icono, etiqueta) — la traducción de ese concepto a lo que realmente recibe el modelo ocurre en un único punto: `matrixPromptBuilder.js`.

Esto da tres niveles de compatibilidad futura, de menor a mayor cambio:

1. **Cambio de modelo, misma forma de API** (lo más probable): un futuro `gemini-X-flash-image` que siga aceptando `{text, inlineData[]}` como hoy. Cambio necesario: **una constante**, `DEFAULT_MODEL` en `imageEditor.js` — exactamente como sería hoy cambiar de modelo. Cero cambios en roles, UI o prompt builder.
2. **El modelo añade soporte nativo para "roles de imagen" estructurados** (p. ej., una API futura que permita etiquetar cada `inlineData` con un campo de rol en vez de describirlo en texto): como el diseño ya separa "qué rol tiene cada imagen" (datos, en `imageRoles.js`) de "cómo se lo decimos al modelo" (`matrixPromptBuilder.js`), ese día `matrixPromptBuilder.js` se sustituye por un formateador alternativo que usa el campo nativo en vez de texto — mismo dato de entrada, mismo dato de salida (`messageParts`), la UI no se entera de que cambió nada por debajo.
3. **Aparecen más roles** (Materiales, Estilo, Texturas, como ya anticipas): una entrada nueva en `imageRoles.js` con su `scope`/`modelInstruction`/`priority`, y una ranura más en la fila de roles de la UI (que ya se genera a partir de esa misma lista, no hardcodeada). Cero archivos nuevos aparte de los datos; cero lógica nueva.

### Por qué no se añade selector de modelo en la UI

Hoy la app no expone ningún selector de modelo (usa internamente `gemini-3.1-flash-image`, Nano Banana 2) y este diseño mantiene esa misma filosofía a propósito: el modelo es un detalle de implementación, no una decisión que el usuario deba tomar para entender "Matriz" y "Referencia". Si en el futuro hay una razón de producto real para exponer elección de modelo, es una decisión de UX independiente de este diseño, no un requisito del sistema de roles.

---

## Resumen de archivos afectados (cuando se implemente — nada de esto existe todavía)

| Archivo | Tipo de cambio |
|---|---|
| `src/roles/imageRoles.js` | **Nuevo** — datos de roles, mismo patrón que `styleLibrary.js` |
| `src/prompts/matrixPromptBuilder.js` | **Nuevo** — construcción de texto, mismo patrón que `optimizerPromptBuilder.js` |
| `src/gemini/imageEditor.js` | Modificado — `editImage()` acepta `imageRoles[]` en vez de `imagePaths[]` (con fallback compatible) |
| `src/prompts/optimizerPromptBuilder.js` | Modificado — recibe roles activos como contexto adicional, igual que ya recibe `styleFragment` |
| `ui/index.html`, nuevo `ui/scripts/components/roleSlotPanel.js` | Modificado/nuevo — activa y da semántica al hueco `#original-gallery` / `.image-gallery` ya preparado |
| `ui/scripts/state/appState.js` | Modificado — `originalImage` evoluciona a `imageRoles: [{role, image}]`, con `originalImage` derivable para no romper otros call sites |

**No se toca:** `src/services/imageImport/**` (sigue leyendo un path y devolviendo bytes, ajeno al concepto de rol), `src/shared/ipcChannels.js` (mismo canal `IMAGE_EDIT`, payload extendido no roto), ni ninguna lógica de Gemini más allá de `imageEditor.js`.

## Riesgos y preguntas abiertas (a validar antes o durante la implementación)

- **Coste/latencia:** cada imagen adicional aumenta el tamaño del payload y probablemente el tiempo de respuesta — a validar empíricamente con 2-3 imágenes reales antes de comprometerse a un límite de roles simultáneos.
- **Fiabilidad del modelo respetando la jerarquía:** ver el límite honesto de la sección 4 — esto se valida solo con pruebas reales, no con diseño de prompt en el vacío.
- **Cuántos roles simultáneos permitir en el MVP:** el documento no fija un número — se recomienda empezar con Matriz + Referencia únicamente (los dos que pides) y validar el patrón antes de añadir más ranuras a la vez.
