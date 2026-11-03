export const TEXT_MODEL = '@cf/qwen/qwen3.8-27b';
export const VISION_MODEL = '@cf/qwen/qwen3.8-27b';
export const CONSENT_VERSION = 'cloudflare-workers-ai-v1';
export const MAX_BODY_BYTES = 2_200_000;
export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_UID_REQUESTS_PER_DAY = 30;
export const MAX_GLOBAL_REQUESTS_PER_DAY = 150;
export const MAX_UID_REQUESTS_PER_MINUTE = 6;

export function readFirestoreValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(readFirestoreValue);
  if ('mapValue' in value) return readFirestoreFields(value.mapValue.fields || {});
  return undefined;
}

export function readFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, readFirestoreValue(value)]));
}

export function isAuthorizedEditor(uid, tripDocument, memberDocument) {
  const trip = readFirestoreFields(tripDocument?.fields || {});
  const member = readFirestoreFields(memberDocument?.fields || {});
  if (trip.ownerUid === uid || trip.ownerId === uid) return true;
  return member.role === 'owner' || member.role === 'copilota';
}

export function validateTripId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

export function collectGeminiParts(requestBody) {
  const system = (requestBody?.system_instruction?.parts || [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n');
  const messages = [];
  let imageBase64 = '';
  let imageMimeType = 'image/jpeg';
  for (const content of requestBody?.contents || []) {
    const text = (content?.parts || [])
      .map(part => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n');
    const imagePart = (content?.parts || []).find(part => part?.inline_data?.data);
    if (imagePart) {
      imageBase64 = String(imagePart.inline_data.data || '');
      imageMimeType = String(imagePart.inline_data.mime_type || 'image/jpeg');
    }
    if (text) messages.push({ role: content?.role === 'model' ? 'assistant' : 'user', content: text });
  }
  return { system, messages, imageBase64, imageMimeType };
}

export function buildAiRequest(requestBody) {
  const { system, messages, imageBase64, imageMimeType } = collectGeminiParts(requestBody);
  const generation = requestBody?.generationConfig || {};
  const maxTokens = Math.max(64, Math.min(Number(generation.maxOutputTokens || 1024), 1536));
  const temperature = Math.max(0, Math.min(Number(generation.temperature ?? 0.2), 1));
  const responseSchema = generation.responseSchema;
  const responseFormat = generation.responseMimeType === 'application/json'
    ? responseSchema
      ? { type: 'json_schema', json_schema: { name: 'hounigo_response', schema: responseSchema, strict: true } }
      : { type: 'json_object' }
    : undefined;

  if (imageBase64) {
    const visionMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map(message => ({ ...message })),
    ];
    const targetIndex = visionMessages.findLastIndex(message => message.role === 'user');
    const imageContent = { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}`, detail: 'high' } };
    if (targetIndex >= 0) {
      const text = visionMessages[targetIndex].content;
      visionMessages[targetIndex].content = [
        ...(text ? [{ type: 'text', text }] : []),
        imageContent,
      ];
    } else {
      visionMessages.push({ role: 'user', content: [imageContent] });
    }
    return {
      kind: 'vision',
      model: VISION_MODEL,
      imageBase64,
      input: {
        messages: visionMessages,
        max_completion_tokens: Math.min(maxTokens, 1200),
        temperature,
        reasoning_effort: 'low',
        chat_template_kwargs: { enable_thinking: false },
        store: false,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      },
    };
  }

  return {
    kind: 'text',
    model: TEXT_MODEL,
    input: {
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
      max_completion_tokens: maxTokens,
      temperature,
      reasoning_effort: 'low',
      chat_template_kwargs: { enable_thinking: false },
      store: false,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    },
  };
}

export function decodeBase64Image(base64) {
  if (!base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) {
    throw new Error('IMAGE_TOO_LARGE');
  }
  const binary = atob(base64);
  if (binary.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return Array.from(bytes);
}

export function normalizeAiResponse(response) {
  const value = response?.choices?.[0]?.message?.content ?? response?.response ?? response?.result ?? response;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export async function hashIdentity(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
