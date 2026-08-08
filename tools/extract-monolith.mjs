import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'jogo-geiger.html');
const source = await readFile(sourcePath, 'utf8');

const styleMatch = source.match(/<style>\r?\n?([\s\S]*?)\r?\n?<\/style>/);
const moduleMatch = source.match(/<script type="module">\r?\n?([\s\S]*?)\r?\n?<\/script>/);

if (!styleMatch || !moduleMatch) {
  throw new Error('Não foi possível localizar os blocos CSS e JavaScript do monólito.');
}

const importMapPattern = /\r?\n?<script type="importmap">[\s\S]*?<\/script>\r?\n?/;
let html = source
  .replace(styleMatch[0], '<link rel="stylesheet" href="/src/styles/main.css" />')
  .replace(importMapPattern, '\n')
  .replace(moduleMatch[0], '<script type="module" src="/src/main.js"></script>');

let javascript = moduleMatch[1];
const audioImports = [
  "import radiationMonitorAudioUrl from '../assets/radiation-monitor.mp3?url';",
  "import phaseOneAudioUrl from '../assets/Fase1.mp3?url';",
  "import victoryAudioUrl from '../assets/calm_victory.mp3?url';",
].join('\n');

javascript = javascript
  .replace(
    "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
    "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';\n" + audioImports,
  )
  .replace("'assets/radiation-monitor.mp3'", 'radiationMonitorAudioUrl')
  .replace("'assets/Fase1.mp3'", 'phaseOneAudioUrl')
  .replace("'assets/calm_victory.mp3'", 'victoryAudioUrl');

await mkdir(path.join(root, 'src', 'styles'), { recursive: true });
await writeFile(path.join(root, 'index.html'), html, 'utf8');
await writeFile(path.join(root, 'src', 'styles', 'main.css'), styleMatch[1] + '\n', 'utf8');
await writeFile(path.join(root, 'src', 'main.js'), javascript + '\n', 'utf8');

console.log('index.html, src/styles/main.css e src/main.js extraídos do monólito.');
