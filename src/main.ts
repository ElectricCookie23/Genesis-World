import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import { h, render } from 'preact';
import { GenesisScene } from './render/scene';
import { Opening } from './render/opening';
import { buildGrid } from './sim/world';
import { randomSeedCode } from './sim/rng';
import { SPEEDS, type FromWorker, type ToWorker } from './shared/protocol';
import { App } from './ui/App';
import { actions, state, update } from './ui/store';

const bootBar = document.getElementById('boot-bar') as HTMLElement;
const bootEl = document.getElementById('boot') as HTMLElement;
const bootMsg = document.getElementById('boot-msg') as HTMLElement;
const progress = (p: number) => { bootBar.style.width = `${Math.round(p * 100)}%`; };

function fatal(message: string): void {
  bootEl.classList.remove('gone');
  bootEl.style.pointerEvents = 'auto';
  (bootEl.querySelector('.line') as HTMLElement).style.display = 'none';
  bootMsg.textContent = message;
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed') || randomSeedCode((Math.random() * 2 ** 32) >>> 0);
  if (!params.get('seed')) {
    params.set('seed', seed);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 720;
  update({ seed });
  progress(0.1);

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  let scene: GenesisScene;
  try {
    scene = new GenesisScene(canvas, params.has('webgl'));
    await scene.init();
  } catch (err) {
    console.error(err);
    fatal('Genesis needs WebGPU or WebGL2 to draw its planet. Please open it in a recent version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  scene.setPixelRatio(mobile ? 1.5 : 2);
  update({ backend: scene.backend });
  progress(0.3);

  const grid = buildGrid();
  progress(0.45);
  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  const send = (m: ToWorker) => worker.postMessage(m);
  let opening: Opening | null = null;
  let started = false;

  const setSpeed = (index: number) => {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, index));
    if (i > 0) state.lastSpeedIndex = i;
    update({ speedIndex: i });
    send({ type: 'speed', index: i });
  };
  actions.setSpeed = setSpeed;
  actions.togglePause = () => setSpeed(state.speedIndex === 0 ? state.lastSpeedIndex : 0);
  actions.skipOpening = () => opening?.skip();

  const openedKey = `genesis:opened:${seed}`;
  const finishOpening = () => {
    if (!state.opening) return;
    try { localStorage.setItem(openedKey, '1'); } catch { /* storage may be blocked */ }
    update({ opening: false, skipVisible: false });
    setSpeed(3);
    window.setTimeout(() => update({ chronicleLine: '' }), 7000);
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready': {
        progress(0.9);
        scene.setGrid(grid, msg.seed);
        scene.applyCells(msg.cells, true);
        scene.applyStats(msg.stats);
        update({ stats: msg.stats });
        let seen = false;
        try { seen = localStorage.getItem(openedKey) === '1'; } catch { /* ignore */ }
        opening = new Opening(scene, reducedMotion);
        opening.onChronicle = () => update({ chronicleLine: 'Year 0. The world is quiet. The water is warm.' });
        if (seen || params.has('skip')) opening.skip();
        started = true;
        progress(1);
        window.setTimeout(() => bootEl.classList.add('gone'), 250);
        window.setTimeout(() => update({ skipVisible: true }), 2000);
        break;
      }
      case 'cells':
        scene.applyCells(msg.cells);
        break;
      case 'stats':
        scene.applyStats(msg.stats);
        update({ stats: msg.stats, fps: scene.fpsAvg });
        break;
      case 'events':
        state.events.push(...msg.events);
        update({});
        break;
      case 'error':
        console.error('sim worker:', msg.message);
        update({ notice: msg.message });
        break;
    }
  };
  worker.onerror = (e) => console.error('worker error', e.message);
  send({ type: 'init', seed });
  progress(0.6);

  render(h(App, {}), document.getElementById('ui') as HTMLElement);
  scene.cam.attach(canvas);

  // the UI hides itself after 4 seconds without input
  let lastActivity = performance.now();
  const activity = () => {
    lastActivity = performance.now();
    if (state.uiHidden) update({ uiHidden: false });
  };
  scene.cam.onActivity = activity;
  window.addEventListener('pointermove', activity);
  window.addEventListener('keydown', activity);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') { e.preventDefault(); actions.togglePause(); }
    else if (e.key >= '1' && e.key <= '6') setSpeed(Number(e.key) - 1);
    else if (e.key === 'h' || e.key === 'H') update({ uiHidden: !state.uiHidden });
  });
  window.addEventListener('resize', () => scene.resize());

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (started) {
      if (opening && !opening.done) {
        opening.update(dt);
        if (opening.done) finishOpening();
      } else if (state.opening) finishOpening();
      scene.frame(dt);
      if (!state.uiHidden && !state.opening && now - lastActivity > 4000) update({ uiHidden: true });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // hooks for automated visual checks
  (window as unknown as { __genesis: unknown }).__genesis = { scene, state, setSpeed, skip: () => opening?.skip(), opening: () => opening };
}

boot().catch((err) => {
  console.error(err);
  fatal('Something went wrong while starting Genesis. Reloading the page usually fixes it.');
});
