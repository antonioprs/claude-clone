// Tudo neste arquivo fala apenas com o localStorage do navegador.
// Nada aqui faz uma requisição de rede - é o núcleo da garantia de privacidade
// do app: histórico e configurações nunca saem da máquina do usuário.

const KEYS = {
  conversations: 'cc:conversations',
  currentId: 'cc:currentId',
  settings: 'cc:settings',
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  proxyUrl: '',
  model: 'claude-sonnet-5',
  effort: 'high',
  theme: 'dark',
  systemPrompt: '',
};

function safeParse(json, fallback) {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...safeParse(localStorage.getItem(KEYS.settings), {}) };
}

export function saveSettings(settings) {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export function loadConversations() {
  const list = safeParse(localStorage.getItem(KEYS.conversations), []);
  return Array.isArray(list) ? list : [];
}

export function saveConversations(conversations) {
  localStorage.setItem(KEYS.conversations, JSON.stringify(conversations));
}

export function getCurrentId() {
  return localStorage.getItem(KEYS.currentId) || null;
}

export function setCurrentId(id) {
  if (id === null) {
    localStorage.removeItem(KEYS.currentId);
  } else {
    localStorage.setItem(KEYS.currentId, id);
  }
}

export function createConversation(model, effort) {
  const now = Date.now();
  return {
    id: uid(),
    title: 'Nova conversa',
    model,
    effort,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function deriveTitle(text) {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || 'Nova conversa';
}

/** Apaga TODO o histórico local e as configurações (API key incluída). */
export function wipeAllLocalData() {
  localStorage.removeItem(KEYS.conversations);
  localStorage.removeItem(KEYS.currentId);
  localStorage.removeItem(KEYS.settings);
}

/** Apaga apenas o histórico de conversas, preservando configurações/API key. */
export function wipeConversationsOnly() {
  localStorage.removeItem(KEYS.conversations);
  localStorage.removeItem(KEYS.currentId);
}
