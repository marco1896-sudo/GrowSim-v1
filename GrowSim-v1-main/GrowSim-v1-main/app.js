'use strict';

(async function bootstrap() {
  const fallback = {
    async init() {
      throw new Error('Engine bootstrap failed.');
    },
    getState() {
      return null;
    },
    onStateChange() {
      return () => {};
    }
  };

  try {
    const mod = await import('./engine/api.js');
    const Game = mod.Game || fallback;

    window.Game = Game;
    await Game.init();

    console.info('[GrowSim] Engine initialized', {
      tick_index: Game.getState()?.tick_index ?? 0
    });
  } catch (error) {
    window.Game = fallback;
    console.error('[GrowSim] Engine bootstrap error', error);
  }
})();
