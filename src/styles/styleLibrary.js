// Built-in style presets. Each style is pure data: an id, a display label/icon for the UI,
// and a prompt fragment that gets merged into the user's instruction before it's sent to
// Gemini (and, optionally, before it's expanded by the prompt optimizer). Adding a new style
// is a one-object addition here — no other module needs to change.
const STYLE_LIBRARY = [
  {
    id: "photorealistic",
    label: "Photorealistic",
    icon: "📷",
    promptFragment:
      "in an ultra-realistic photographic style, natural lighting, lifelike textures, sharp focus, DSLR quality",
  },
  {
    id: "oil-painting",
    label: "Oil Painting",
    icon: "🖼️",
    promptFragment:
      "as a classical oil painting, rich visible brushstrokes, deep color layering, canvas texture, museum quality",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    icon: "🎨",
    promptFragment:
      "as a delicate watercolor painting, soft pigment bleeds, light washes of color, textured paper background",
  },
  {
    id: "anime",
    label: "Anime",
    icon: "⛩️",
    promptFragment:
      "in a polished Japanese anime art style, clean linework, cel shading, vibrant colors, expressive features",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    icon: "🎬",
    promptFragment:
      "with cinematic lighting and color grading, dramatic composition, shallow depth of field, film-still quality",
  },
  {
    id: "fantasy",
    label: "Fantasy",
    icon: "🐉",
    promptFragment:
      "in an epic fantasy art style, magical atmosphere, dramatic light rays, richly detailed environment",
  },
  {
    id: "medieval",
    label: "Medieval",
    icon: "🏰",
    promptFragment:
      "in a medieval historical style, period-accurate clothing and setting, painterly detail, muted earthy tones",
  },
  {
    id: "sci-fi",
    label: "Sci-Fi",
    icon: "🚀",
    promptFragment:
      "in a futuristic sci-fi style, sleek technology, neon or holographic accents, atmospheric ambient lighting",
  },
  {
    id: "vintage",
    label: "Vintage",
    icon: "📻",
    promptFragment:
      "with a vintage retro aesthetic, faded film grain, warm nostalgic color palette, period-appropriate styling",
  },
  {
    id: "metal",
    label: "Metal",
    icon: "⚙️",
    promptFragment:
      "with a brushed-metal, industrial aesthetic, cold specular highlights, high-contrast metallic textures",
  },
  {
    id: "dark",
    label: "Dark",
    icon: "🌑",
    promptFragment:
      "in a dark moody style, low-key lighting, deep shadows, high contrast, atmospheric tension",
  },
  {
    id: "comic",
    label: "Comic",
    icon: "💥",
    promptFragment:
      "as a bold comic book illustration, thick ink outlines, halftone shading, punchy saturated colors",
  },
];

function listStyles() {
  return STYLE_LIBRARY;
}

function getStyleById(styleId) {
  return STYLE_LIBRARY.find((style) => style.id === styleId) ?? null;
}

module.exports = { listStyles, getStyleById };
