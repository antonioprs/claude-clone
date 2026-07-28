import { defineConfig } from 'vite';

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/
// so the build needs to know the repo name to resolve asset paths correctly.
// Override at build time with:  VITE_BASE=/meu-repo/ npm run build
// If this becomes a <user>.github.io *user* site (repo named antonioprs.github.io),
// set VITE_BASE=/ instead.
const base = process.env.VITE_BASE || '/claude-clone/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
