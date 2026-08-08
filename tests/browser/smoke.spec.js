import { expect, test } from '@playwright/test';

test('inicializa o jogo modular em /game/ sem erros', async ({ page }) => {
  const errors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('./');

  await expect(page).toHaveTitle('MGP-101 Área Restrita');
  await expect(page.locator('#boot-screen')).toBeVisible();
  await expect(page.locator('canvas.webgl')).toHaveCount(1);
  await expect(page.locator('#end-map')).toHaveAttribute('width', '560');
  await expect(page.locator('#end-map')).toHaveAttribute('height', '420');
  await expect.poll(() => page.evaluate(() => Boolean(window.__game))).toBe(true);

  await page.getByRole('button', { name: 'CONTINUAR' }).click();
  await expect(page.locator('#boot-screen')).toBeHidden();
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#start-screen li')).toHaveText([
    'NOVO JOGO',
    'CONFIGURAÇÕES',
    'RECORDES',
    'CONTROLES',
    'SOBRE',
  ]);

  await page.getByText('NOVO JOGO', { exact: true }).click();
  await page.getByText('TREINAMENTO', { exact: true }).click();
  await page.getByText(/SAVE 01/).click();

  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#health-panel')).toBeVisible();
  await expect(page.locator('#hud-mission')).toHaveText('Encontre a pastilha radioativa perdida.');
  await expect.poll(() => page.evaluate(() => ({
    phase: window.__game.phase,
    difficulty: window.__game.baseDifficulty.key,
    doseLimit: window.__game.mission.doseLimit,
    health: window.__game.health.health,
  }))).toEqual({ phase: 1, difficulty: 'training', doseLimit: 40, health: 100 });

  expect(errors.filter((message) => !/pointer lock|root document/i.test(message))).toEqual([]);
  expect(failedResponses).toEqual([]);
});
