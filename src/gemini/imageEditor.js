// Core image-editing logic: turns a prompt (+ one or more images) into an edited image via
// Gemini 2.5 Flash Image, with optional multi-turn "Conversation Mode".
//
// Conversation Mode uses the SDK's own chat session (ai.chats.create / chat.sendMessage), which
// resends the full turn history — including the model's own previously generated image — on every
// call. That means a follow-up instruction like "now make it rain" only needs to carry the new
// text; the model already has the prior result in context. See ARCHITECTURE.md for details.
const { getClient } = require("./geminiClient");
const imageImportService = require("../services/imageImport/imageImportService");

const DEFAULT_MODEL = "gemini-2.5-flash-image";

// sessionId -> Chat instance. One entry per open conversation; cleared when the renderer starts
// a new session (e.g. a new image is dropped) or conversation mode is turned off.
const activeSessions = new Map();

function startSession(sessionId) {
  const ai = getClient();
  const chat = ai.chats.create({ model: DEFAULT_MODEL });
  activeSessions.set(sessionId, chat);
  return chat;
}

function endSession(sessionId) {
  activeSessions.delete(sessionId);
}

function hasActiveSession(sessionId) {
  return activeSessions.has(sessionId);
}

function extractImageFromResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);

  if (!imagePart) {
    const textPart = parts.find((part) => part.text);
    const reason = textPart?.text
      ? `Model responded with text instead of an image: "${textPart.text}"`
      : "No image data was returned by the model.";
    throw new Error(reason);
  }

  return {
    data: Buffer.from(imagePart.inlineData.data, "base64"),
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

/**
 * Edits one or more images with a text prompt.
 *
 * `imagePaths` accepts multiple paths (not just one) so future multi-image / reference-image
 * features don't require a signature change. Today the UI only ever sends one.
 *
 * When `conversationMode` is true and a session is already open for `sessionId`, only the text
 * prompt is sent — the model already has the prior image in context. Otherwise this is treated
 * as the first turn: the images at `imagePaths` are read from disk and sent alongside the prompt.
 */
async function editImage({ sessionId, imagePaths = [], prompt, conversationMode = true }) {
  if (!prompt || !prompt.trim()) {
    throw new Error("Prompt must not be empty.");
  }

  const ai = getClient();
  const existingChat = conversationMode ? activeSessions.get(sessionId) : null;

  if (existingChat) {
    const response = await existingChat.sendMessage({ message: [{ text: prompt }] });
    return extractImageFromResponse(response);
  }

  if (imagePaths.length === 0) {
    throw new Error("At least one image is required to start an edit.");
  }

  const images = await Promise.all(imagePaths.map((imagePath) => imageImportService.importImage(imagePath)));
  const messageParts = [
    { text: prompt },
    ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.base64 } })),
  ];

  if (conversationMode) {
    const chat = startSession(sessionId);
    const response = await chat.sendMessage({ message: messageParts });
    return extractImageFromResponse(response);
  }

  const response = await ai.models.generateContent({ model: DEFAULT_MODEL, contents: messageParts });
  return extractImageFromResponse(response);
}

module.exports = { editImage, startSession, endSession, hasActiveSession, DEFAULT_MODEL };
