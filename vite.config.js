import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game/',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
