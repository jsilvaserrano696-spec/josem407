function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the generated image."));
    image.src = dataUrl;
  });
}

// Gemini is good at isolating a subject on a clean white field, but it does not reliably
// return a real alpha channel. Remove only light, neutral pixels connected to the canvas edge;
// enclosed white details on the subject (eyes, reflections, labels, etc.) remain untouched.
export async function makeEdgeBackgroundTransparent({ base64, mimeType }) {
  const image = await loadImage(`data:${mimeType};base64,${base64}`);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = frame;
  const pixelCount = canvas.width * canvas.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const isBackground = (index) => {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    // Include the pale neutral shadow/gradient image models often add despite being asked for
    // pure white. The flood-fill still cannot cross the darker tyres or coloured bodywork, so
    // those remain protected even where they touch the floor.
    return Math.min(r, g, b) >= 135 && Math.max(r, g, b) - Math.min(r, g, b) <= 48;
  };
  const enqueue = (index) => {
    if (!visited[index] && isBackground(index)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < canvas.width; x += 1) {
    enqueue(x);
    enqueue((canvas.height - 1) * canvas.width + x);
  }
  for (let y = 0; y < canvas.height; y += 1) {
    enqueue(y * canvas.width);
    enqueue(y * canvas.width + canvas.width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % canvas.width;
    const y = Math.floor(index / canvas.width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < canvas.width) enqueue(index + 1);
    if (y > 0) enqueue(index - canvas.width);
    if (y + 1 < canvas.height) enqueue(index + canvas.width);
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (!visited[index]) continue;
    const offset = index * 4;
    // Every accepted pixel belongs to the edge-connected background. Keeping pale or shadow
    // pixels partially opaque makes them reappear as a grey veil when pasted onto white.
    data[offset + 3] = 0;
  }

  context.putImageData(frame, 0, 0);
  return { base64: canvas.toDataURL("image/png").split(",")[1], mimeType: "image/png" };
}
