// Pure pixel operations behind AXION's protected-edit mask. Kept independent from Canvas so
// the expensive/critical selection and merge rules can be tested in Node as well as used by
// the renderer.
export function floodSelect({ pixels, width, height, x, y, tolerance = 32, mask, erase = false, changedIndices = null }) {
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
    throw new TypeError("Invalid RGBA pixel buffer.");
  }
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError("Invalid selection mask.");
  }
  const seedX = Math.floor(x);
  const seedY = Math.floor(y);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return mask;

  const pixelCount = width * height;
  const seedIndex = seedY * width + seedX;
  const seedOffset = seedIndex * 4;
  const seedR = pixels[seedOffset];
  const seedG = pixels[seedOffset + 1];
  const seedB = pixels[seedOffset + 2];
  const limit = Math.max(0, Math.min(255, Number(tolerance) || 0));
  const distanceLimit = 3 * limit * limit;
  const visited = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  let stackSize = 1;
  stack[0] = seedIndex;
  visited[seedIndex] = 1;
  const value = erase ? 0 : 255;

  while (stackSize > 0) {
    const index = stack[--stackSize];
    const offset = index * 4;
    const dr = pixels[offset] - seedR;
    const dg = pixels[offset + 1] - seedG;
    const db = pixels[offset + 2] - seedB;
    if (dr * dr + dg * dg + db * db > distanceLimit) continue;

    if (mask[index] !== value) {
      mask[index] = value;
      changedIndices?.push(index);
    }
    const px = index % width;
    if (px > 0 && !visited[index - 1]) {
      visited[index - 1] = 1;
      stack[stackSize++] = index - 1;
    }
    if (px + 1 < width && !visited[index + 1]) {
      visited[index + 1] = 1;
      stack[stackSize++] = index + 1;
    }
    if (index >= width && !visited[index - width]) {
      visited[index - width] = 1;
      stack[stackSize++] = index - width;
    }
    if (index + width < pixelCount && !visited[index + width]) {
      visited[index + width] = 1;
      stack[stackSize++] = index + width;
    }
  }

  return mask;
}

export function paintMaskCircle({ mask, width, height, x, y, radius, erase = false, changedIndices = null }) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) throw new TypeError("Invalid selection mask.");
  const safeRadius = Math.max(1, Number(radius) || 1);
  const minX = Math.max(0, Math.floor(x - safeRadius));
  const maxX = Math.min(width - 1, Math.ceil(x + safeRadius));
  const minY = Math.max(0, Math.floor(y - safeRadius));
  const maxY = Math.min(height - 1, Math.ceil(y + safeRadius));
  const radiusSquared = safeRadius * safeRadius;
  const value = erase ? 0 : 255;
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px - x;
      const dy = py - y;
      const index = py * width + px;
      if (dx * dx + dy * dy <= radiusSquared && mask[index] !== value) {
        mask[index] = value;
        changedIndices?.push(index);
      }
    }
  }
  return mask;
}

export function compositeProtectedPixels({ original, edited, mask }) {
  if (!(original instanceof Uint8ClampedArray) || !(edited instanceof Uint8ClampedArray) || original.length !== edited.length) {
    throw new TypeError("Original and edited RGBA buffers must have the same length.");
  }
  if (!(mask instanceof Uint8Array) || mask.length * 4 !== original.length) throw new TypeError("Invalid selection mask.");
  const result = new Uint8ClampedArray(original);
  for (let index = 0; index < mask.length; index += 1) {
    const alpha = mask[index] / 255;
    if (alpha === 0) continue;
    const offset = index * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      result[offset + channel] = Math.round(original[offset + channel] * (1 - alpha) + edited[offset + channel] * alpha);
    }
  }
  return result;
}
