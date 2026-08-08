import { beforeEach, describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/config/gameConfig.js';
import { deleteCampaignSlot, loadCampaignProgress, loadCampaignSlots, saveCampaignProgress } from '../../src/storage/persistence.js';

const cookies = new Map();
const storage = new Map();

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    get cookie() {
      return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(serialized) {
      const [pair] = serialized.split(';');
      const separator = pair.indexOf('=');
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    },
  },
});

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
});

beforeEach(() => {
  cookies.clear();
  storage.clear();
});

describe('persistência da campanha', () => {
  it('mantém três slots e limita a fase ao final da campanha', () => {
    saveCampaignProgress(DIFFICULTIES.normal, 20, 2);
    const slots = loadCampaignSlots();

    expect(slots).toHaveLength(3);
    expect(slots[0]).toBeNull();
    expect(slots[1]).toMatchObject({ slot: 2, difficulty: 'normal', phase: 13 });
    expect(slots[2]).toBeNull();
  });

  it('migra o save legado para o slot 1', () => {
    const legacy = encodeURIComponent(JSON.stringify({ difficulty: 'hard', phase: 4 }));
    cookies.set('mgp101_campaign', legacy);

    expect(loadCampaignSlots()[0]).toMatchObject({ slot: 1, difficulty: 'hard', phase: 4 });
    expect(loadCampaignProgress()).toMatchObject({ difficulty: 'hard', phase: 4 });
  });

  it('apaga somente o slot selecionado', () => {
    saveCampaignProgress(DIFFICULTIES.training, 2, 1);
    saveCampaignProgress(DIFFICULTIES.hard, 5, 3);
    deleteCampaignSlot(1);

    const slots = loadCampaignSlots();
    expect(slots[0]).toBeNull();
    expect(slots[2]).toMatchObject({ difficulty: 'hard', phase: 5 });
  });
});
