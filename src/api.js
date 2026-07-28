// Fala com a Anthropic Messages API através do proxy Cloudflare Worker do
// usuário (necessário porque api.anthropic.com não envia cabeçalhos CORS
// para chamadas feitas direto do navegador). A API key nunca é gravada
// neste arquivo - ela vem do localStorage em tempo de execução e viaja
// só até o Worker do próprio usuário.

export const ANTHROPIC_VERSION = '2023-06-01';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Envia a conversa e transmite (stream) a resposta do assistente.
 * @param {object} opts
 * @param {string} opts.proxyUrl - URL do Cloudflare Worker (termina em /v1/messages ou raiz)
 * @param {string} opts.apiKey - chave da Anthropic, lida do localStorage
 * @param {string} opts.model
 * @param {Array<{role: 'user'|'assistant', content: string}>} opts.messages
 * @param {string} [opts.system]
 * @param {number} [opts.maxTokens] - substitui o padrão de 4096
 * @param {object} [opts.extra] - campos extras a espalhar no body (ex: thinking, output_config)
 * @param {(update: { text: string, thinking: string }) => void} opts.onUpdate
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ text: string, thinking: string }>}
 */
export async function streamMessage({ proxyUrl, apiKey, model, messages, system, maxTokens, extra, onUpdate, signal }) {
  if (!apiKey) throw new ApiError('Nenhuma API key configurada. Abra as Configurações e cole sua chave da Anthropic.', 0);
  if (!proxyUrl) throw new ApiError('Nenhuma URL de proxy configurada. Abra as Configurações e informe a URL do seu Cloudflare Worker.', 0);

  const endpoint = proxyUrl.replace(/\/+$/, '').endsWith('/v1/messages')
    ? proxyUrl
    : `${proxyUrl.replace(/\/+$/, '')}/v1/messages`;

  const body = {
    model,
    max_tokens: maxTokens || 4096,
    stream: true,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(extra || {}),
  };
  if (system && system.trim()) body.system = system.trim();

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new ApiError(detail || `Erro HTTP ${res.status}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let fullThinking = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const chunk of events) {
      const lines = chunk.split('\n');
      const dataLine = lines.find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const raw = dataLine.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      let evt;
      try {
        evt = JSON.parse(raw);
      } catch {
        continue;
      }

      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
        fullText += evt.delta.text;
        onUpdate({ text: fullText, thinking: fullThinking });
      } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'thinking_delta') {
        fullThinking += evt.delta.thinking;
        onUpdate({ text: fullText, thinking: fullThinking });
      } else if (evt.type === 'error') {
        throw new ApiError(evt.error?.message || 'Erro desconhecido da API', 0);
      }
    }
  }

  return { text: fullText, thinking: fullThinking };
}
