// Medição reproduzível de desempenho em um Chromium com GPU real.
//
//   node tools/bench.mjs [url] [--headed] [--vsync] [--quality=auto|high|medium|low]
//
// Sem --vsync o limite de quadros do navegador é desligado, então o tempo de
// quadro mostra o custo real da cena em vez de travar na taxa do monitor.
// Math.random recebe semente fixa: fonte, NORMs e partículas caem sempre nos
// mesmos lugares, e duas execuções medem exatamente a mesma cena.
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:4173/';
const headed = args.includes('--headed');
const vsync = args.includes('--vsync');
const quality = (args.find((a) => a.startsWith('--quality=')) || '--quality=high').split('=')[1];
const WIDTH = 1280, HEIGHT = 720;

const systemChrome = ['/usr/bin/chromium', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome']
  .find((p) => existsSync(p));

const browser = await chromium.launch({
  headless: !headed,
  executablePath: process.env.BENCH_CHROME || systemChrome,
  args: [
    '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    ...(vsync ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']),
  ],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript(() => {
  let s = 0x2545f491;
  Math.random = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.__game));
const readyMs = Date.now() - t0;

const result = await page.evaluate(async ({ quality }) => {
  const g = window.__game;
  const r = g.sceneManager.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const measure = async (secs) => {
    r.info.autoReset = false;
    const times = [];
    let calls = 0, tris = 0, n = 0, last = performance.now();
    await new Promise((res) => {
      const start = last;
      const frame = () => {
        const now = performance.now();
        times.push(now - last); last = now;
        calls += r.info.render.calls; tris += r.info.render.triangles; n++;
        r.info.reset();
        if (now - start < secs * 1000) requestAnimationFrame(frame); else res();
      };
      r.info.reset();
      requestAnimationFrame(frame);
    });
    r.info.autoReset = true;
    times.shift();
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const q = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
    return {
      fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(2),
      p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +times[times.length - 1].toFixed(2),
      over20ms: times.filter((t) => t > 20).length, frames: times.length,
      calls: Math.round(calls / n), tris: Math.round(tris / n),
      quality: g.sceneManager.quality, pixelRatio: +r.getPixelRatio().toFixed(2),
    };
  };

  const out = {
    env: {
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d',
      viewport: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio,
      cores: navigator.hardwareConcurrency, quality,
    },
    scenes: {},
  };

  g.settings.set?.('graphicsQuality', quality);
  if (g.settings.state.graphicsQuality !== quality) {
    g.settings.state.graphicsQuality = quality;
    g._applyGraphicsQuality(quality);
  }

  await sleep(1500);
  out.scenes.menu = await measure(5);

  document.getElementById('boot-screen').style.display = 'none';
  g.saveSlot = 3;
  const tPhase = performance.now();
  g._startPhaseInPlace(1, g.baseDifficulty);
  g._enterGameplay();
  out.phaseStartMs = +(performance.now() - tPhase).toFixed(1);
  await sleep(2500);
  out.scenes.inicio = await measure(6);

  const P = g.player, cam = g.sceneManager.camera;
  const look = async (x, z, yaw) => {
    P.position.set(x, P.position.y, z);
    P.velocity.set(0, 0, 0);
    cam.rotation.set(0, yaw, 0, 'YXZ');
    await sleep(700);
    return measure(4);
  };
  out.scenes.centro_N = await look(0, 0, 0);
  out.scenes.centro_L = await look(0, 0, -Math.PI / 2);
  out.scenes.centro_S = await look(0, 0, Math.PI);
  out.scenes.centro_O = await look(0, 0, Math.PI / 2);
  // canto olhando a diagonal inteira do laboratório: a vista mais carregada
  out.scenes.diagonal = await look(-9.5, 6.5, -Math.PI / 4 - Math.PI / 2 + Math.PI / 2);

  // interação: abre todos os recipientes e mede com o campo visível ligado
  for (const c of g.lab.containers) { if (!c.locked) c.open = true; }
  P.position.copy(g.source.position); P.position.y = 0; P.position.z += 1.2;
  cam.lookAt(g.source.position);
  await sleep(1500);
  out.scenes.interacao = await measure(4);

  // três reinícios de fase: geometrias/texturas não podem crescer
  const before = { geo: r.info.memory.geometries, tex: r.info.memory.textures };
  for (let i = 0; i < 3; i++) { g._startPhaseInPlace(1, g.baseDifficulty); g._enterGameplay(); await sleep(300); }
  out.memory = {
    geometries: r.info.memory.geometries, textures: r.info.memory.textures,
    geometriesGrowth: r.info.memory.geometries - before.geo, texturesGrowth: r.info.memory.textures - before.tex,
    programs: r.info.programs.length,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
  out.finalQuality = g.sceneManager.quality;
  return out;
}, { quality });

result.readyMs = readyMs;
result.errors = errors;
console.log(JSON.stringify(result, null, 2));
await browser.close();
