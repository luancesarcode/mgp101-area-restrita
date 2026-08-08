import { Game } from './core/Game.js';

// ==== BOOTSTRAP =============================================================
const game = new Game();
game.start();
window.__game = game; // acesso via console para depuração
