# AXION Intent Schema v1

> Estado: definido en `src/core/intentSchema.js` e **integrado en AXION CORE**. ANALYZE
> (`analyze.js`) construye el Intent; DIRECTOR (`director.js`) lo recibe y lo normaliza de forma
> neutral (sin decisión creativa real todavía); `axionCore.js` lo valida con fines diagnósticos
> tras ANALYZE y tras DIRECTOR (nunca bloquea, nunca lo modifica). El Intent todavía no influye en
> EXECUTE (`imageEditor.js`), en las llamadas a Gemini ni en el resultado visual — sigue
> exactamente el mismo flujo que antes de que el Intent existiera. `promptOptimizer.js` tampoco lo
> consume aún. Este documento describe el contrato de datos completo, incluyendo campos y
> comportamiento objetivo que las etapas todavía no implementan como lógica real.

## Finalidad

El Intent es el lenguaje interno común que permitirá a ANALYZE, DIRECTOR, PROMPT ENGINE, EXECUTE e
INSPECTOR pasarse información sin reinterpretar continuamente lenguaje natural. Es puramente
interno: nunca se muestra al usuario (ver `DESIGN_PHILOSOPHY.md` — "nada técnico cruza al
usuario") y nunca contiene datos de imagen en bruto (bytes/base64) — solo un booleano (`hasImage`)
y, cuando exista, metadatos ligeros, siguiendo el mismo criterio que ya aplica
`inspector.js`/`resultMeta`.

## Responsabilidades por módulo (diseño objetivo, no implementado)

| Módulo | Qué produce/lee en el Intent |
|---|---|
| **ANALYZE** | Puebla `analysis.*` a partir de `request.*` (que nunca toca). Nunca escribe en `direction`. |
| **DIRECTOR** | Puebla `direction.*` a partir de `analysis.*`. Puede refinar `protect`/`constraints` heredados de ANALYZE, pero no reescribe `request` ni `analysis`. |
| **PROMPT ENGINE** (`promptOptimizer.js`) | Lee el Intent completo (cuando esté conectado) para construir el prompt final de Gemini; no lo modifica. |
| **EXECUTE** (`imageEditor.js`) | No conoce el Intent — solo recibe `prompt`/`currentImage`/`originalImage`, exactamente como hoy. |
| **INSPECTOR** | Lee `protect`/`constraints`/`analysis`/`direction` para verificar el resultado; no modifica el Intent, solo produce su propio reporte. |

## Tabla completa de campos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `schemaVersion` | `number` | sí | Versión del contrato. v1 = `1`. |
| `operation` | `"edit" \| "generate"` | sí | Qué pipeline se ejecuta. Espeja `axionCore.runEditPipeline`/`runGeneratePipeline`. |
| `hasImage` | `boolean` | sí | Hecho sobre el payload real: ¿hay una imagen de origen? Ver "operation vs. hasImage" abajo. |
| `request.text` | `string` | sí | Texto del usuario, verbatim, nunca reinterpretado. Equivale a `displayPrompt` en IPC. |
| `request.styleId` | `string \| null` | sí | Estilo elegido por el usuario (`styleLibrary.js`), verbatim. |
| `analysis.targets` | `string[]` | sí | Elementos/atributos que ANALYZE identifica como objeto del cambio. |
| `analysis.action` | `string \| null` | sí | Descriptor normalizado de una línea (texto libre en v1, p. ej. `"increase_realism"`). |
| `analysis.assumptions` | `string[]` | sí | Qué se infirió más allá del texto literal, en frases legibles. |
| `analysis.confidence` | `number \| null` | sí | 0–1, autoevaluación de ANALYZE. `null` = no calculado. |
| `direction.styleId` | `string \| null` | sí | Estilo confirmado/resuelto por DIRECTOR (puede repetir `request.styleId`). |
| `direction.priorities` | `string[]` | sí | Orden de importancia; índice 0 = más importante. |
| `direction.notes` | `string[]` | sí | Notas de criterio artístico. |
| `protect` | `ProtectEntry[]` | sí | Ver "Estructura de protección". |
| `constraints` | `string[]` | sí | Reglas operativas duras, no ligadas a preservar identidad (formato, aspecto, contenido prohibido). |
| `metadata.createdAt` | `number \| null` | sí | Timestamp de creación (`Date.now()`), o `null`. |
| `metadata.source` | `string \| null` | sí | Procedencia libre (p. ej. `"axionCore@stub-v1"`). |

## Petición explícita vs. interpretación vs. decisión artística

El esquema separa estas categorías en secciones distintas, no en una bolsa plana:

- **Petición explícita del usuario** → `request` (`text`, `styleId`). Nunca se reescribe.
- **Interpretación de ANALYZE** → `analysis` (`targets`, `action`, `assumptions`, `confidence`).
  Todo lo que aquí aparece es inferido, no literal.
- **Decisión artística de DIRECTOR** → `direction` (`styleId`, `priorities`, `notes`).
- **Restricciones obligatorias** → `constraints` (transversal, no pertenece a ninguna etapa en
  particular porque tanto EXECUTE como INSPECTOR deben poder leerlas directamente).
- **Elementos protegidos** → `protect` (igual de transversal que `constraints`).
- **Nivel de confianza** → `analysis.confidence`. Vive junto a `analysis` porque es
  específicamente la autoevaluación de ANALYZE sobre su propia interpretación, no una propiedad
  general del Intent.
- **Suposiciones del sistema** → `analysis.assumptions`, mismo razonamiento que `confidence`.

## Estructura de protección (`protect`)

```
ProtectEntry = {
  type: "element" | "attribute" | "region" | "rule",
  ref: string,
  of: string | null,
  source: "user" | "inferred",
  note: string | null,
}
```

Se descartó una simple lista de strings porque `protect` cubre cuatro categorías conceptualmente
distintas y una lista plana obliga a INSPECTOR a adivinar cuál es cuál por convención de nombre:

- `type: "element"` — un elemento entero queda fuera de alcance (`ref: "characters"`).
- `type: "attribute"` — una propiedad visual, global o de un elemento concreto vía `of`
  (`ref: "camera_angle", of: null` / `ref: "pose", of: "character"`).
- `type: "region"` — una zona de la imagen. En v1 solo un identificador libre; si en el futuro
  existe segmentación real, `ref` puede pasar a apuntar a una máscara sin romper el shape.
- `type: "rule"` — una regla de protección no atada a un elemento concreto
  (`ref: "do_not_add_text"`).

`source` distingue, por cada entrada individual (no solo a nivel de Intent completo), si la
protección viene de una petición explícita del usuario o es el comportamiento por defecto que ya
implementa el fidelity anchor (ver `ARCHITECTURE.md`) — proteger composición/cámara/identidad
aunque el usuario no lo pida explícitamente.

`priority` (para resolver conflictos entre protecciones, al estilo de la tabla `priority` que
diseña `MATRIX_REFERENCE_MODE_DESIGN.md` para roles de imagen) se evaluó y **se decidió no incluir
en v1** — no hay todavía ningún consumidor que necesite resolver conflictos entre protecciones.

## `operation` vs. `hasImage`

No son redundantes aunque hoy casi siempre coincidan:

- `operation` es **qué pipeline corrió** (`edit` llama a `runEditPipeline`, `generate` a
  `runGeneratePipeline`).
- `hasImage` es **un hecho sobre el payload real** recibido.

En v1, `imageEditor.js` solo soporta `edit` con imagen y `generate` sin imagen — por eso
`validateIntent()` trata `operation: "edit"` + `hasImage: false` y `operation: "generate"` +
`hasImage: true` como errores de validación. Esto es una regla de negocio de v1, comprobada en la
validación, no una restricción estructural del esquema: un futuro modo (p. ej. "generar con imagen
de referencia") podría legítimamente combinar `generate` con `hasImage: true` sin necesitar
cambiar la forma del contrato, solo la regla de validación.

`validateIntent()` **reporta** esta incoherencia como error — nunca la corrige silenciosamente.

## Reglas de validación (`validateIntent`)

`validateIntent(intent)` devuelve siempre `{ valid: boolean, errors: string[] }`, nunca lanza
excepción por datos de usuario. Comprueba, como mínimo:

1. `intent` es un objeto plano.
2. `schemaVersion` es exactamente `SCHEMA_VERSION`.
3. `operation` es `"edit"` o `"generate"`.
4. `hasImage` es booleano.
5. Coherencia entre `operation` y `hasImage` (ver arriba) — solo se comprueba si ambos campos ya
   son individualmente válidos, para no apilar un segundo error confuso sobre uno ya reportado.
6. `request.text` es string; `request.styleId` es string o `null`.
7. `analysis.targets`/`analysis.assumptions` son arrays de strings; `analysis.action` es string o
   `null`; `analysis.confidence` es `null` o un número entre 0 y 1.
8. `direction.styleId` es string o `null`; `direction.priorities`/`direction.notes` son arrays de
   strings.
9. Cada entrada de `protect` tiene `type` válido, `ref` no vacío, `of` string o `null`, `source`
   válido, `note` string o `null`.
10. `constraints` es un array de strings.
11. `metadata.createdAt` es número o `null`; `metadata.source` es string o `null`.

La ausencia de un campo obligatorio se detecta de forma natural: un campo `undefined` falla su
comprobación de tipo correspondiente (p. ej. `typeof undefined !== "string"`), no requiere un
chequeo de presencia aparte.

## Compatibilidad futura

- **Vocabulario abierto, no forma cerrada:** ejes visuales (realismo, iluminación, materiales,
  composición, cámara, narrativa…) no son campos del esquema — son valores de texto libre dentro
  de `analysis.targets`, `protect[].ref`/`.of` o `direction.priorities`. Añadir un eje nuevo no
  requiere tocar `intentSchema.js`.
- **`action` como texto libre en v1:** cuando ANALYZE tenga lógica real, se podrá evaluar cerrar
  el vocabulario a un enum — no es un cambio de forma, solo de validación.
- **`priority` en `ProtectEntry`:** ver arriba — punto de extensión identificado, no implementado.
- **Persistencia en Historial:** `historyStore.js` no guarda el Intent hoy
  (`{id, prompt, styleId, timestamp, favorite}`). El Intent es JSON plano por diseño,
  serializable sin transformación, para poder adjuntarse a una entrada de historial en el futuro
  sin rediseñar ninguno de los dos formatos.
- **`schemaVersion`:** cualquier cambio de forma incompatible incrementa este número; los
  consumidores futuros pueden ramificar por versión en vez de asumir siempre la última forma.

## Los cinco ejemplos

### 1. Mejorar el realismo de un castillo sin cambiar personajes

```json
{
  "schemaVersion": 1, "operation": "edit", "hasImage": true,
  "request": { "text": "Mejora el realismo del castillo", "styleId": null },
  "analysis": {
    "targets": ["castle"], "action": "increase_realism",
    "assumptions": ["\"personajes\" interpretado como todos los characters presentes en la imagen"],
    "confidence": 0.8
  },
  "direction": { "styleId": null, "priorities": ["realism"], "notes": [] },
  "protect": [
    { "type": "element", "ref": "characters", "of": null, "source": "user", "note": null },
    { "type": "attribute", "ref": "composition", "of": null, "source": "inferred", "note": null },
    { "type": "attribute", "ref": "camera_angle", "of": null, "source": "inferred", "note": null }
  ],
  "constraints": [],
  "metadata": { "createdAt": 1785456000000, "source": "example" }
}
```

### 2. Mejorar el agua sin tocar el cielo

```json
{
  "schemaVersion": 1, "operation": "edit", "hasImage": true,
  "request": { "text": "Mejora el agua, no toques el cielo", "styleId": null },
  "analysis": { "targets": ["water"], "action": "improve_material_realism", "assumptions": [], "confidence": 0.9 },
  "direction": { "styleId": null, "priorities": ["materials"], "notes": [] },
  "protect": [{ "type": "element", "ref": "sky", "of": null, "source": "user", "note": null }],
  "constraints": [],
  "metadata": { "createdAt": null, "source": "example" }
}
```

### 3. Generar una escena desde cero

```json
{
  "schemaVersion": 1, "operation": "generate", "hasImage": false,
  "request": { "text": "Un bosque encantado al atardecer", "styleId": "fantasy" },
  "analysis": { "targets": ["scene"], "action": "generate_scene", "assumptions": [], "confidence": null },
  "direction": { "styleId": "fantasy", "priorities": [], "notes": [] },
  "protect": [],
  "constraints": [],
  "metadata": { "createdAt": null, "source": "example" }
}
```

### 4. Modificar iluminación conservando composición y cámara

```json
{
  "schemaVersion": 1, "operation": "edit", "hasImage": true,
  "request": { "text": "Cambia la iluminación a hora dorada", "styleId": null },
  "analysis": { "targets": ["lighting"], "action": "adjust_lighting", "assumptions": [], "confidence": 0.85 },
  "direction": { "styleId": null, "priorities": ["lighting"], "notes": [] },
  "protect": [
    { "type": "attribute", "ref": "composition", "of": null, "source": "user", "note": null },
    { "type": "attribute", "ref": "camera_angle", "of": null, "source": "user", "note": null }
  ],
  "constraints": [],
  "metadata": { "createdAt": null, "source": "example" }
}
```

### 5. Editar únicamente una región seleccionada

```json
{
  "schemaVersion": 1, "operation": "edit", "hasImage": true,
  "request": { "text": "Cambia solo esta zona seleccionada", "styleId": null },
  "analysis": { "targets": ["selected_region"], "action": null, "assumptions": [], "confidence": 0.6 },
  "direction": { "styleId": null, "priorities": [], "notes": [] },
  "protect": [{ "type": "region", "ref": "outside_selection", "of": null, "source": "inferred", "note": "todo lo fuera de la región seleccionada" }],
  "constraints": [],
  "metadata": { "createdAt": null, "source": "example" }
}
```

## Limitaciones conocidas de v1

- `action` es texto libre, no un enum cerrado — no hay forma mecánica de comparar dos `action`
  distintos entre sí más allá de igualdad de string.
- `protect`/`constraints` son descriptivos (texto), no verificables mecánicamente — un
  `constraint` de relación de aspecto, por ejemplo, no tiene un campo numérico propio en v1;
  INSPECTOR no puede comprobarlo automáticamente sin lógica adicional fuera de este esquema.
- No hay resolución de conflictos entre entradas de `protect` (sin `priority`) — si dos
  protecciones futuras chocaran, no hay regla mecánica para decidir cuál gana.
- No hay soporte de `historyStore.js` para persistir el Intent — solo se garantiza que es
  serializable a JSON, no que ya se guarde en ningún sitio.
- `validateIntent()` es una validación escrita a mano, sin librería externa (restricción
  explícita del proyecto) — crecerá en complejidad manualmente si el esquema se amplía.
- El esquema no está conectado a `axionCore.js` ni a ningún flujo real; `analyze.js`, `director.js`
  e `inspector.js` siguen sin implementar lógica real y no producen ni consumen este Intent
  todavía.
