import './style.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  loadSettings,
  saveSettings,
  loadConversations,
  saveConversations,
  getCurrentId,
  setCurrentId,
  createConversation,
  deriveTitle,
  wipeAllLocalData,
} from './storage.js';
import { streamMessage, ApiError } from './api.js';

marked.setOptions({ breaks: true, gfm: true });

const MODELS = [
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
];

const state = {
  settings: loadSettings(),
  conversations: loadConversations(),
  currentId: getCurrentId(),
  sidebarOpen: true,
  streaming: false,
  abortController: null,
};

applyTheme(state.settings.theme);

const app = document.getElementById('app');
app.innerHTML = `
  <aside id="sidebar" class="flex h-full flex-col bg-claude-sidebar dark:bg-claude-sidebar border-r border-claude-border transition-all duration-200 shrink-0" style="width:272px;">
    <div class="flex items-center gap-2 p-3">
      <button id="toggleSidebarBtn" title="Recolher barra lateral" class="icon-btn">
        ${icon('sidebar')}
      </button>
      <span class="font-semibold text-sm tracking-wide flex-1 truncate">Claude Clone</span>
    </div>
    <div class="px-3 pb-2">
      <button id="newChatBtn" class="w-full flex items-center gap-2 rounded-lg border border-claude-border px-3 py-2 text-sm hover:bg-claude-surface transition-colors">
        ${icon('plus')} <span>Nova conversa</span>
      </button>
    </div>
    <div id="historyList" class="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2"></div>
    <div class="border-t border-claude-border p-2 flex items-center gap-1">
      <button id="settingsBtn" class="icon-btn flex-1 flex items-center gap-2 justify-start px-2" title="Configurações">
        ${icon('gear')} <span class="text-sm">Configurações</span>
      </button>
      <button id="deleteAllBtn" class="icon-btn" title="Apagar todo o histórico local">
        ${icon('trash')}
      </button>
    </div>
  </aside>

  <main class="flex-1 flex flex-col min-w-0">
    <header class="flex items-center gap-2 p-3 border-b border-claude-border shrink-0">
      <button id="showSidebarBtn" class="icon-btn hidden" title="Mostrar barra lateral">${icon('sidebar')}</button>
      <div class="relative">
        <button id="modelBtn" class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-claude-surface transition-colors">
          <span id="modelLabel"></span>
          ${icon('chevronDown')}
        </button>
        <div id="modelMenu" class="hidden absolute left-0 mt-1 w-56 rounded-lg border border-claude-border bg-claude-surface shadow-lg z-20 overflow-hidden"></div>
      </div>
      <div class="flex-1"></div>
      <button id="themeBtn" class="icon-btn" title="Alternar tema">${icon('theme')}</button>
    </header>

    <div id="messages" class="flex-1 overflow-y-auto"></div>

    <div id="composerWrap" class="shrink-0 px-4 pb-6 pt-2">
      <div class="mx-auto max-w-3xl">
        <div id="composer" class="flex items-end gap-2 rounded-2xl border border-claude-border bg-claude-surface px-3 py-2 shadow-sm focus-within:border-claude-accent/60 transition-colors">
          <textarea id="promptInput" rows="1" placeholder="Envie uma mensagem para o Claude..."
            class="flex-1 resize-none bg-transparent outline-none text-sm leading-6 max-h-52 py-1.5 placeholder:text-claude-muted"></textarea>
          <button id="sendBtn" class="icon-btn bg-claude-accent hover:bg-claude-accentHover text-white shrink-0" title="Enviar">
            ${icon('send')}
          </button>
        </div>
        <p class="text-center text-xs text-claude-muted mt-2">
          Suas conversas ficam salvas só neste navegador. Nada é enviado a nenhum servidor além da Anthropic.
        </p>
      </div>
    </div>
  </main>

  <div id="settingsModal" class="hidden fixed inset-0 z-30 items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-lg rounded-2xl bg-claude-surface border border-claude-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Configurações</h2>
        <button id="closeSettingsBtn" class="icon-btn">${icon('close')}</button>
      </div>

      <label class="block space-y-1">
        <span class="text-sm font-medium">API Key da Anthropic</span>
        <div class="flex gap-2">
          <input id="apiKeyInput" type="password" placeholder="sk-ant-api03-..." autocomplete="off"
            class="flex-1 rounded-lg border border-claude-border bg-transparent px-3 py-2 text-sm outline-none focus:border-claude-accent/60" />
          <button id="toggleApiKeyBtn" type="button" class="icon-btn shrink-0" title="Mostrar/ocultar">${icon('eye')}</button>
        </div>
        <span class="text-xs text-claude-muted">Fica salva só no localStorage deste navegador. Nunca é enviada para nenhum lugar além do seu próprio proxy.</span>
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium">URL do proxy (Cloudflare Worker)</span>
        <input id="proxyUrlInput" type="text" placeholder="https://seu-worker.seu-usuario.workers.dev"
          class="w-full rounded-lg border border-claude-border bg-transparent px-3 py-2 text-sm outline-none focus:border-claude-accent/60" />
        <span class="text-xs text-claude-muted">Veja o README para publicar o worker gratuito que resolve o bloqueio de CORS da API da Anthropic.</span>
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium">Modelo padrão</span>
        <select id="defaultModelInput" class="w-full rounded-lg border border-claude-border bg-transparent px-3 py-2 text-sm outline-none focus:border-claude-accent/60">
          ${MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium">System prompt (opcional)</span>
        <textarea id="systemPromptInput" rows="3" placeholder="Instruções fixas para todas as conversas..."
          class="w-full resize-none rounded-lg border border-claude-border bg-transparent px-3 py-2 text-sm outline-none focus:border-claude-accent/60"></textarea>
      </label>

      <div class="border-t border-claude-border pt-4 flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">Apagar todo o histórico local</p>
          <p class="text-xs text-claude-muted">Remove todas as conversas, a API key e as configurações deste navegador.</p>
        </div>
        <button id="wipeBtn" class="rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 px-3 py-2 text-sm shrink-0">
          Apagar tudo
        </button>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button id="cancelSettingsBtn" class="rounded-lg px-4 py-2 text-sm hover:bg-claude-surface2">Cancelar</button>
        <button id="saveSettingsBtn" class="rounded-lg bg-claude-accent hover:bg-claude-accentHover text-white px-4 py-2 text-sm">Salvar</button>
      </div>
    </div>
  </div>
`;

injectIconButtonStyles();

// ---------- element refs ----------
const el = {
  sidebar: document.getElementById('sidebar'),
  toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
  showSidebarBtn: document.getElementById('showSidebarBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  historyList: document.getElementById('historyList'),
  settingsBtn: document.getElementById('settingsBtn'),
  deleteAllBtn: document.getElementById('deleteAllBtn'),
  modelBtn: document.getElementById('modelBtn'),
  modelLabel: document.getElementById('modelLabel'),
  modelMenu: document.getElementById('modelMenu'),
  themeBtn: document.getElementById('themeBtn'),
  messages: document.getElementById('messages'),
  composerWrap: document.getElementById('composerWrap'),
  promptInput: document.getElementById('promptInput'),
  sendBtn: document.getElementById('sendBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleApiKeyBtn: document.getElementById('toggleApiKeyBtn'),
  proxyUrlInput: document.getElementById('proxyUrlInput'),
  defaultModelInput: document.getElementById('defaultModelInput'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  wipeBtn: document.getElementById('wipeBtn'),
};

// ---------- helpers ----------
function icon(name) {
  const icons = {
    sidebar:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    gear: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    trash:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
    send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    theme: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    dots: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  };
  return icons[name] || '';
}

function injectIconButtonStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .icon-btn { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; color:inherit; }
    .icon-btn:hover { background: rgba(150,140,125,0.15); }
    #sendBtn.icon-btn:hover { background: var(--tw-accent-hover, #b5563a); }
  `;
  document.head.appendChild(style);
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme !== 'light');
  document.body.classList.toggle('bg-claudeLight-bg', theme === 'light');
  document.body.classList.toggle('text-claudeLight-text', theme === 'light');
  document.documentElement.style.setProperty('color-scheme', theme === 'light' ? 'light' : 'dark');
  document.body.style.background = theme === 'light' ? '#faf9f5' : '#262624';
  document.body.style.color = theme === 'light' ? '#3d3d3a' : '#eeece2';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text) {
  const raw = marked.parse(text || '');
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
}

function persistConversations() {
  saveConversations(state.conversations);
}

function getCurrentConversation() {
  return state.conversations.find((c) => c.id === state.currentId) || null;
}

// ---------- sidebar / history ----------
function renderHistory() {
  const list = [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  if (list.length === 0) {
    el.historyList.innerHTML = `<p class="text-xs text-claude-muted px-2 py-3">Nenhuma conversa ainda.</p>`;
    return;
  }
  el.historyList.innerHTML = list
    .map((c) => {
      const active = c.id === state.currentId;
      return `
      <div data-id="${c.id}" class="history-item group flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer text-sm ${active ? 'bg-claude-surface2' : 'hover:bg-claude-surface'}">
        <span class="flex-1 truncate">${escapeHtml(c.title)}</span>
        <button data-del="${c.id}" class="icon-btn opacity-0 group-hover:opacity-100 shrink-0" style="width:24px;height:24px;" title="Excluir conversa">${icon('trash')}</button>
      </div>`;
    })
    .join('');

  el.historyList.querySelectorAll('.history-item').forEach((node) => {
    node.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      switchConversation(node.dataset.id);
    });
  });
  el.historyList.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(btn.dataset.del);
    });
  });
}

function switchConversation(id) {
  state.currentId = id;
  setCurrentId(id);
  renderHistory();
  renderMessages();
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter((c) => c.id !== id);
  persistConversations();
  if (state.currentId === id) {
    state.currentId = null;
    setCurrentId(null);
  }
  renderHistory();
  renderMessages();
}

// ---------- messages ----------
function renderMessages() {
  const convo = getCurrentConversation();
  if (!convo || convo.messages.length === 0) {
    el.messages.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center px-4">
        <div class="w-14 h-14 rounded-2xl bg-claude-accent flex items-center justify-center text-white text-2xl font-semibold mb-4">C</div>
        <h1 class="text-2xl font-medium">Como posso ajudar hoje?</h1>
      </div>`;
    return;
  }

  el.messages.innerHTML = `
    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      ${convo.messages.map((m, i) => messageHtml(m, i)).join('')}
    </div>`;

  el.messages.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyToClipboard(btn));
  });

  el.messages.scrollTop = el.messages.scrollHeight;
}

function messageHtml(m, idx) {
  if (m.role === 'user') {
    return `
      <div class="flex justify-end">
        <div class="max-w-[80%] rounded-2xl bg-claude-surface2 px-4 py-2.5 text-sm whitespace-pre-wrap break-words">${escapeHtml(m.content)}</div>
      </div>`;
  }
  const bodyHtml = renderMarkdown(m.content);
  return `
    <div class="group flex flex-col gap-1">
      <div class="md text-sm leading-relaxed">${bodyHtml}${m.streaming ? '<span class="caret"></span>' : ''}</div>
      ${
        !m.streaming
          ? `<button data-copy data-idx="${idx}" class="icon-btn opacity-0 group-hover:opacity-100 self-start" style="width:26px;height:26px;" title="Copiar resposta">${icon('copy')}</button>`
          : ''
      }
    </div>`;
}

function copyToClipboard(btn) {
  const convo = getCurrentConversation();
  const idx = Number(btn.dataset.idx);
  const text = convo?.messages[idx]?.content || '';
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = icon('check');
    setTimeout(() => (btn.innerHTML = icon('copy')), 1200);
  });
}

function appendMessageDom(m, idx) {
  const wrap = el.messages.querySelector('.max-w-3xl');
  if (!wrap) {
    renderMessages();
    return;
  }
  wrap.insertAdjacentHTML('beforeend', messageHtml(m, idx));
  el.messages.scrollTop = el.messages.scrollHeight;
}

function updateStreamingMessageDom(idx) {
  const convo = getCurrentConversation();
  const wrap = el.messages.querySelector('.max-w-3xl');
  if (!wrap) return;
  const node = wrap.children[idx];
  if (!node) return;
  node.outerHTML = messageHtml(convo.messages[idx], idx);
  el.messages.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyToClipboard(btn));
  });
  el.messages.scrollTop = el.messages.scrollHeight;
}

// ---------- sending ----------
function autoResizeTextarea() {
  el.promptInput.style.height = 'auto';
  el.promptInput.style.height = `${Math.min(el.promptInput.scrollHeight, 208)}px`;
}

function setSendingUi(sending) {
  state.streaming = sending;
  el.sendBtn.innerHTML = sending ? icon('stop') : icon('send');
  el.sendBtn.title = sending ? 'Parar' : 'Enviar';
  el.promptInput.disabled = sending;
}

async function handleSend() {
  if (state.streaming) {
    state.abortController?.abort();
    return;
  }

  const text = el.promptInput.value.trim();
  if (!text) return;

  let convo = getCurrentConversation();
  if (!convo) {
    convo = createConversation(state.settings.model);
    state.conversations.push(convo);
    state.currentId = convo.id;
    setCurrentId(convo.id);
  }
  if (convo.messages.length === 0) {
    convo.title = deriveTitle(text);
  }

  convo.messages.push({ role: 'user', content: text });
  convo.updatedAt = Date.now();
  persistConversations();
  renderHistory();
  renderMessages();

  el.promptInput.value = '';
  autoResizeTextarea();

  const assistantIdx = convo.messages.length;
  convo.messages.push({ role: 'assistant', content: '', streaming: true });
  appendMessageDom(convo.messages[assistantIdx], assistantIdx);

  setSendingUi(true);
  state.abortController = new AbortController();

  try {
    const finalText = await streamMessage({
      proxyUrl: state.settings.proxyUrl,
      apiKey: state.settings.apiKey,
      model: convo.model || state.settings.model,
      messages: convo.messages.slice(0, -1),
      system: state.settings.systemPrompt,
      signal: state.abortController.signal,
      onDelta: (_delta, full) => {
        convo.messages[assistantIdx].content = full;
        updateStreamingMessageDom(assistantIdx);
      },
    });
    convo.messages[assistantIdx].content = finalText;
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    const msg = aborted
      ? convo.messages[assistantIdx].content || '_(interrompido)_'
      : `⚠️ ${err instanceof ApiError ? err.message : 'Falha ao conectar com o proxy/API. Verifique a URL do worker e sua conexão.'}`;
    convo.messages[assistantIdx].content = msg;
  } finally {
    convo.messages[assistantIdx].streaming = false;
    convo.updatedAt = Date.now();
    persistConversations();
    updateStreamingMessageDom(assistantIdx);
    renderHistory();
    setSendingUi(false);
    state.abortController = null;
  }
}

// ---------- model selector ----------
function renderModelMenu() {
  el.modelLabel.textContent = MODELS.find((m) => m.id === (getCurrentConversation()?.model || state.settings.model))?.label || 'Selecionar modelo';
  el.modelMenu.innerHTML = MODELS.map(
    (m) => `<button data-model="${m.id}" class="w-full text-left px-3 py-2 text-sm hover:bg-claude-surface2 flex items-center justify-between">
      <span>${m.label}</span>
    </button>`
  ).join('');
  el.modelMenu.querySelectorAll('[data-model]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const convo = getCurrentConversation();
      if (convo) {
        convo.model = btn.dataset.model;
        persistConversations();
      }
      state.settings.model = btn.dataset.model;
      saveSettings(state.settings);
      el.modelMenu.classList.add('hidden');
      renderModelMenu();
    });
  });
}

// ---------- settings modal ----------
function openSettings() {
  el.apiKeyInput.value = state.settings.apiKey;
  el.proxyUrlInput.value = state.settings.proxyUrl;
  el.defaultModelInput.value = state.settings.model;
  el.systemPromptInput.value = state.settings.systemPrompt;
  el.apiKeyInput.type = 'password';
  el.settingsModal.classList.remove('hidden');
  el.settingsModal.classList.add('flex');
}

function closeSettings() {
  el.settingsModal.classList.add('hidden');
  el.settingsModal.classList.remove('flex');
}

function saveSettingsFromModal() {
  state.settings.apiKey = el.apiKeyInput.value.trim();
  state.settings.proxyUrl = el.proxyUrlInput.value.trim();
  state.settings.model = el.defaultModelInput.value;
  state.settings.systemPrompt = el.systemPromptInput.value;
  saveSettings(state.settings);
  renderModelMenu();
  closeSettings();
}

// ---------- events ----------
el.newChatBtn.addEventListener('click', () => {
  state.currentId = null;
  setCurrentId(null);
  renderHistory();
  renderMessages();
  renderModelMenu();
  el.promptInput.focus();
});

el.toggleSidebarBtn.addEventListener('click', () => setSidebarOpen(false));
el.showSidebarBtn.addEventListener('click', () => setSidebarOpen(true));

function setSidebarOpen(open) {
  state.sidebarOpen = open;
  el.sidebar.style.width = open ? '272px' : '0px';
  el.sidebar.style.overflow = open ? 'visible' : 'hidden';
  el.sidebar.style.borderRightWidth = open ? '1px' : '0px';
  el.showSidebarBtn.classList.toggle('hidden', open);
}

el.settingsBtn.addEventListener('click', openSettings);
el.closeSettingsBtn.addEventListener('click', closeSettings);
el.cancelSettingsBtn.addEventListener('click', closeSettings);
el.saveSettingsBtn.addEventListener('click', saveSettingsFromModal);
el.settingsModal.addEventListener('click', (e) => {
  if (e.target === el.settingsModal) closeSettings();
});

el.toggleApiKeyBtn.addEventListener('click', () => {
  el.apiKeyInput.type = el.apiKeyInput.type === 'password' ? 'text' : 'password';
});

el.deleteAllBtn.addEventListener('click', () => confirmWipe(false));
el.wipeBtn.addEventListener('click', () => confirmWipe(true));

function confirmWipe(fromModal) {
  const ok = window.confirm(
    'Isso vai apagar TODAS as conversas salvas neste navegador' +
      (fromModal ? ', além da API key e das configurações.' : '.') +
      ' Essa ação não pode ser desfeita. Continuar?'
  );
  if (!ok) return;
  wipeAllLocalData();
  state.conversations = [];
  state.currentId = null;
  state.settings = loadSettings();
  renderHistory();
  renderMessages();
  renderModelMenu();
  if (fromModal) closeSettings();
}

el.modelBtn.addEventListener('click', () => {
  el.modelMenu.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#modelBtn') && !e.target.closest('#modelMenu')) {
    el.modelMenu.classList.add('hidden');
  }
});

el.themeBtn.addEventListener('click', () => {
  state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
  saveSettings(state.settings);
  applyTheme(state.settings.theme);
});

el.promptInput.addEventListener('input', autoResizeTextarea);
el.promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
el.sendBtn.addEventListener('click', handleSend);

// ---------- init ----------
renderHistory();
renderMessages();
renderModelMenu();
