/**
 * Proxy CORS mínimo para a Anthropic Messages API.
 *
 * O que ele faz: recebe a requisição do navegador, repassa para
 * https://api.anthropic.com/v1/messages com os mesmos headers e corpo,
 * e devolve a resposta (incluindo o stream SSE) com os headers de CORS
 * que o navegador exige.
 *
 * O que ele NÃO faz: não armazena, loga nem tem acesso persistente à sua
 * API key. A chave chega em cada requisição (header x-api-key, vinda do
 * localStorage do seu navegador) e é apenas repassada adiante.
 *
 * Ajuste ALLOWED_ORIGIN para a URL exata do seu GitHub Pages antes de
 * publicar, para que só o seu site consiga usar este worker.
 */

const ANTHROPIC_API = 'https://api.anthropic.com';

// Restrito ao site publicado no GitHub Pages - só ele pode usar este worker.
const ALLOWED_ORIGIN = 'https://antonioprs.github.io';

const ALLOWED_HEADERS = ['content-type', 'x-api-key', 'anthropic-version', 'anthropic-dangerous-direct-browser-access', 'anthropic-beta'];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN === '*' ? '*' : origin && origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: { message: 'Método não suportado. Use POST.' } }), {
        status: 405,
        headers: { 'content-type': 'application/json', ...cors },
      });
    }

    const url = new URL(request.url);
    const targetPath = url.pathname.startsWith('/v1/') ? url.pathname : '/v1/messages';

    const forwardHeaders = new Headers();
    for (const h of ALLOWED_HEADERS) {
      const v = request.headers.get(h);
      if (v) forwardHeaders.set(h, v);
    }

    const upstream = await fetch(`${ANTHROPIC_API}${targetPath}`, {
      method: 'POST',
      headers: forwardHeaders,
      body: request.body,
    });

    const responseHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) responseHeaders.set(k, v);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
