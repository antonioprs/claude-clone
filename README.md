# Claude Clone — cliente web privado para a API da Anthropic

Interface que replica visualmente o Claude.com: sidebar de conversas, seletor de
modelo, composer centralizado, dark/light mode. Roda 100% no seu navegador —
não existe backend próprio, banco de dados ou servidor de histórico. As únicas
duas partes da arquitetura são:

1. **Frontend estático** (este repositório) — hospedado no GitHub Pages.
2. **Proxy CORS** (`cloudflare-worker/worker.js`) — um Cloudflare Worker gratuito
   que só repassa sua requisição para `api.anthropic.com`, porque a Anthropic
   bloqueia chamadas feitas diretamente do navegador.

Sua API key e todo o histórico de chat ficam **apenas no `localStorage` do seu
navegador**. Nada é salvo em nenhum servidor — nem o Worker, nem o GitHub
Pages, guardam qualquer dado seu.

---

## 1. Pré-requisitos

- [Node.js 20+](https://nodejs.org/) e npm
- Conta no GitHub (`antonioprs`)
- Conta gratuita na [Cloudflare](https://dash.cloudflare.com/sign-up)
- Uma API key da Anthropic ([console.anthropic.com](https://console.anthropic.com/settings/keys))

---

## 2. Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Clique no ícone de engrenagem para colar sua
API key e a URL do proxy (passo 4) antes de conversar.

---

## 3. Publicando o Cloudflare Worker (proxy CORS)

### Opção A — pelo dashboard (mais simples, sem instalar nada)

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Create Worker**.
2. Dê um nome, ex: `claude-clone-proxy`, e clique em **Deploy** para criar o esqueleto.
3. Clique em **Edit code**, apague o conteúdo padrão e cole o conteúdo de
   [`cloudflare-worker/worker.js`](cloudflare-worker/worker.js).
4. (Recomendado) Troque a linha:
   ```js
   const ALLOWED_ORIGIN = '*';
   ```
   por:
   ```js
   const ALLOWED_ORIGIN = 'https://antonioprs.github.io';
   ```
   Isso impede que outros sites usem o seu Worker como proxy.
5. Clique em **Deploy**. Você receberá uma URL como
   `https://claude-clone-proxy.<seu-usuario>.workers.dev` — é essa URL que vai
   no campo **"URL do proxy"** das configurações do app.

### Opção B — via CLI (`wrangler`)

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

O `wrangler.toml` já está configurado com o nome `claude-clone-proxy`. Ao final
o terminal mostra a URL pública do Worker.

### Testando o proxy

```bash
curl -i https://SEU-WORKER.workers.dev/v1/messages \
  -H "x-api-key: sk-ant-..." \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":16,"messages":[{"role":"user","content":"oi"}]}'
```

Se voltar um JSON com a resposta do modelo (e não um erro de CORS ou 522), o
proxy está funcionando.

---

## 4. Publicando o frontend no GitHub Pages

Este repo já vem com um workflow (`.github/workflows/deploy.yml`) que builda e
publica automaticamente a cada `push` na branch `main`.

1. Crie um repositório em `github.com/antonioprs`, por exemplo `claude-clone`,
   e suba este projeto:
   ```bash
   git init
   git add .
   git commit -m "Claude clone inicial"
   git branch -M main
   git remote add origin https://github.com/antonioprs/claude-clone.git
   git push -u origin main
   ```
2. No repositório, vá em **Settings → Pages** e em **Source** selecione
   **GitHub Actions** (não "Deploy from a branch").
3. Espere o workflow rodar em **Actions** (leva ~1 min). Ao terminar, o site
   fica disponível em:
   ```
   https://antonioprs.github.io/claude-clone/
   ```

### Importante: nome do repositório × `base` do Vite

O Vite precisa saber o subcaminho onde o site vai morar. O workflow já resolve
isso automaticamente (`VITE_BASE=/${{ github.event.repository.name }}/`), então
**se você nomear o repositório diferente de `claude-clone`, não precisa mudar
nada** — o build usa o nome real do repo.

Só ajuste manualmente se:
- O repositório se chamar `antonioprs.github.io` (repo de usuário, serve na
  raiz) → nesse caso edite `.github/workflows/deploy.yml` e troque o `env` da
  etapa de build para `VITE_BASE: /`.
- Quiser buildar localmente para publicar manualmente, use:
  ```bash
  VITE_BASE=/claude-clone/ npm run build
  ```
  e suba o conteúdo de `dist/` para a branch/pasta que o Pages estiver servindo.

---

## 5. Configurando o app depois de publicado

1. Abra `https://antonioprs.github.io/claude-clone/`.
2. Clique no ícone de engrenagem (⚙) na barra lateral.
3. Preencha:
   - **API Key da Anthropic** — sua chave `sk-ant-...`.
   - **URL do proxy** — a URL do Worker do passo 3 (ex.:
     `https://claude-clone-proxy.seu-usuario.workers.dev`).
   - **Modelo padrão** e, se quiser, um **system prompt** fixo.
4. Salve. Pronto — já dá pra conversar.

Essas informações ficam salvas só no `localStorage` do navegador que você usou
para configurar; em outro navegador/computador você precisa repetir o passo.

---

## 6. Modelos disponíveis

| Nome exibido        | ID enviado à API                |
|---------------------|----------------------------------|
| Claude 3 Opus        | `claude-3-opus-20240229`        |
| Claude 3.5 Sonnet     | `claude-3-5-sonnet-20241022`    |
| Claude 3 Haiku        | `claude-3-haiku-20240307`       |

A Anthropic ocasionalmente descontinua versões antigas de modelo. Se um ID
parar de funcionar, confira os IDs atuais em
[docs.anthropic.com/en/docs/about-claude/models](https://docs.anthropic.com/en/docs/about-claude/models)
e atualize a lista `MODELS` em [`src/main.js`](src/main.js).

---

## 7. Privacidade e armazenamento local

- Histórico de conversas, API key, URL do proxy e preferências ficam **apenas**
  no `localStorage` do navegador (chaves `cc:conversations`, `cc:currentId`,
  `cc:settings`). Nada é sincronizado com nenhum servidor.
- **"Apagar todo o histórico local"** (ícone de lixeira na sidebar, ou botão
  dentro de Configurações) remove tudo de uma vez — inclusive a API key.
- Fechar e reabrir a aba/navegador preserva as conversas normalmente, pois
  `localStorage` persiste entre sessões (mas é local àquele navegador
  específico — não sincroniza entre dispositivos, nem sobrevive a "limpar
  dados de navegação").
- O único servidor de terceiros que recebe dados é a própria Anthropic
  (via o seu Worker), para gerar as respostas.

---

## 8. Estrutura do projeto

```
.
├── index.html                    # shell HTML da SPA
├── src/
│   ├── main.js                   # UI, estado, event handlers
│   ├── api.js                    # chamada streaming à Anthropic (via proxy)
│   ├── storage.js                # persistência em localStorage
│   └── style.css                 # Tailwind + estilos de markdown/scrollbar
├── cloudflare-worker/
│   ├── worker.js                 # proxy CORS
│   └── wrangler.toml
├── .github/workflows/deploy.yml  # build + deploy automático no GitHub Pages
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 9. Solução de problemas

- **Erro de CORS no console** — confirme que a "URL do proxy" nas
  Configurações aponta para o Worker (não para `api.anthropic.com`
  diretamente), e que o Worker foi publicado com sucesso.
- **401 / `authentication_error`** — API key inválida, expirada ou colada com
  espaços extras.
- **403 no Worker** — se você travou `ALLOWED_ORIGIN` para o domínio do GitHub
  Pages, confirme que bate exatamente com a URL do site (incluindo `https://`).
- **Tela em branco no GitHub Pages, mas funcionando em `npm run dev`** —
  quase sempre é o `base` do Vite desalinhado com o nome do repositório; veja
  a seção 4.
- **Respostas não chegam (stream trava)** — alguns bloqueadores de conteúdo
  interferem em `ReadableStream`/SSE; teste em janela anônima sem extensões.
