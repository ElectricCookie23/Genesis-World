import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import { h, render } from 'preact';
import { GenesisScene } from './render/scene';
import { Opening } from './render/opening';
import { buildGrid } from './sim/world';
import { randomSeedCode } from './sim/rng';
import type { SimEvent } from './sim/events';
import { SPEEDS, type FromWorker, type ToWorker } from './shared/protocol';
import { App } from './ui/App';
import { closeAll } from './ui/panels';
import { describeIndividual } from './render/creatures';
import { Vector3 } from 'three/webgpu';
import { actions, state, togglePanel, update } from './ui/store';

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

const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ } },
};

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed') || randomSeedCode((Math.random() * 2 ** 32) >>> 0);
  if (!params.get('seed')) {
    params.set('seed', seed);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 720;
  update({ seed, mobile, hintStep: store.get('genesis:hints') === '1' ? 99 : 0 });
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
  scene.plantBudget = mobile ? 15000 : 60000;
  scene.creatureBudget = mobile ? 1500 : 5000;
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
  actions.flyToCell = (cell, dist) => {
    if (cell < 0) return;
    scene.cam.flyTo(grid.lon[cell]!, grid.lat[cell]!, dist ?? Math.min(scene.cam.dist, 1.2));
    scene.cam.idle = 0;
  };
  actions.selectSpecies = (id) => {
    const sp = state.species.get(id);
    update({ selectedSpecies: id, whyEvent: -1 });
    if (sp && sp.extinctYear < 0) actions.flyToCell(sp.homeCell, Math.min(scene.cam.dist, 1.4));
  };
  actions.setSlowOnEvents = (on) => {
    update({ slowOnEvents: on });
    send({ type: 'settings', slowOnEvents: on });
  };
  actions.copySeedLink = () => {
    const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(seed)}`;
    void navigator.clipboard?.writeText(url).then(() => {
      update({ notice: 'Link copied. Anyone who opens it gets this same world.' });
      window.setTimeout(() => update({ notice: '' }), 3500);
    });
  };
  actions.newWorld = (s) => {
    location.href = `${location.pathname}?seed=${encodeURIComponent(s ?? randomSeedCode((Math.random() * 2 ** 32) >>> 0))}`;
  };

  // milestone pop-ups play one after another
  const toasts: SimEvent[] = [];
  let toastUntil = 0;
  const pumpToasts = (now: number) => {
    if (state.milestone && now > toastUntil) update({ milestone: null });
    if (!state.milestone && toasts.length && !state.opening) {
      update({ milestone: toasts.shift()! });
      toastUntil = now + 7000;
    }
  };

  const openedKey = `genesis:opened:${seed}`;
  const finishOpening = () => {
    if (!state.opening) return;
    store.set(openedKey, '1');
    scene.ownsFlash = true;
    update({ opening: false, skipVisible: false });
    setSpeed(3);
    window.setTimeout(() => update({ chronicleLine: '' }), 7000);
    // three short hints on a first visit
    if (state.hintStep < 3) {
      const next = () => {
        update({ hintStep: state.hintStep + 1 });
        if (state.hintStep < 3) window.setTimeout(next, 6500);
        else store.set('genesis:hints', '1');
      };
      window.setTimeout(next, 6500);
    }
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
        opening = new Opening(scene, reducedMotion);
        opening.onChronicle = () => update({ chronicleLine: 'Year 0. The world is quiet. The water is warm.' });
        if (store.get(openedKey) === '1' || params.has('skip')) opening.skip();
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
        for (const ev of msg.events) {
          state.events[ev.id] = ev;
          // keep effect links current on the events we already hold
          for (const c of ev.causes) {
            const cause = state.events[c];
            if (cause && !cause.effects.includes(ev.id)) cause.effects.push(ev.id);
          }
          if (ev.importance >= 1 && ev.id > 0) state.chronicle.push(ev.id);
          if (ev.importance >= 3) toasts.push(ev);
          if (ev.type === 'impact') scene.flash(0.9);
          else if (ev.type === 'super-eruption') scene.flash(0.35);
        }
        update({});
        break;
      case 'species':
        for (const sp of msg.species) state.species.set(sp.id, sp);
        scene.setSpecies(state.species);
        update({});
        break;
      case 'herds':
        scene.setHerds(msg.herds);
        break;
      case 'plants':
        for (const pl of msg.plants) state.plants.set(pl.id, pl);
        scene.setPlants(state.plants);
        break;
      case 'error':
        console.error('sim worker:', msg.message);
        update({ notice: 'The simulation hit a problem. Reload the page to restart it.' });
        break;
    }
  };
  worker.onerror = (e) => console.error('worker error', e.message);
  send({ type: 'init', seed });
  progress(0.6);

  render(h(App, {}), document.getElementById('ui') as HTMLElement);
  scene.cam.attach(canvas);
  const refreshCreature = (following?: boolean) => {
    const c = state.creature;
    if (!c) return;
    const ind = scene.creatures?.byKey(c.key);
    const info = state.species.get(c.species);
    if (!ind || !info) return;
    const d = describeIndividual(ind, info);
    if (d.action !== c.action || following !== undefined) update({ creature: { ...c, ...d, following: following ?? c.following } });
  };
  actions.followCreature = (on) => {
    scene.follow(on && state.creature ? state.creature.key : null);
    if (state.creature) refreshCreature(on);
  };
  scene.cam.onTap = (x, y, double) => {
    if (state.godTool !== 'meteor') {
      const ind = scene.pickCreature(x, y);
      const info = ind ? state.species.get(ind.species) : undefined;
      if (ind && info) {
        const d = describeIndividual(ind, info);
        update({ creature: { key: ind.key, species: ind.species, ...d, following: double }, selectedSpecies: -1, whyEvent: -1 });
        if (double) scene.follow(ind.key);
        return;
      }
    }
    if (state.godTool === 'meteor') {
      const hit = scene.pick(x, y);
      if (hit) {
        send({ type: 'god', tool: 'meteor', cell: scene.cellAt(hit.x, hit.y, hit.z), power: 0.8 });
        update({ godTool: '', panel: 'none' });
      }
    }
  };
  scene.cam.onLongPress = () => update({ panel: 'god' });

  // the UI hides itself after 4 seconds without input
  let lastActivity = performance.now();
  const activity = () => {
    lastActivity = performance.now();
    if (state.uiHidden) update({ uiHidden: false });
  };
  scene.cam.onActivity = activity;
  window.addEventListener('pointermove', activity);
  window.addEventListener('pointerdown', activity);
  window.addEventListener('keydown', activity);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); actions.togglePause(); }
    else if (e.key >= '1' && e.key <= '6') setSpeed(Number(e.key) - 1);
    else if (k === 'h') update({ uiHidden: !state.uiHidden });
    else if (k === 'c') togglePanel('chronicle');
    else if (k === 't') togglePanel('tree');
    else if (k === 'g') togglePanel('god');
    else if (e.key === '?' || k === '/') togglePanel('help');
    else if (k === 'p') { update({ postcard: !state.postcard }); scene.cam.idle = state.postcard ? 100 : 0; }
    else if (k === 'f') { if (state.creature) actions.followCreature(!state.creature.following); }
    else if (k === 'escape' && scene.following !== null) actions.followCreature(false);
    else if (k === 'escape') { if (state.postcard) update({ postcard: false }); else closeAll(); }
  });
  window.addEventListener('resize', () => scene.resize());

  let lastFocus = 0;
  const focusVec = new Vector3();
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
      pumpToasts(now);
      // tell the worker where we are looking, twice a second
      if (now - lastFocus > 500) {
        lastFocus = now;
        scene.cam.focusDir(focusVec);
        send({ type: 'focus', x: focusVec.x, y: focusVec.y, z: focusVec.z, altitude: scene.cam.dist });
        refreshCreature();
      }
      const busy = state.panel !== 'none' || state.whyEvent >= 0 || state.selectedSpecies >= 0;
      if (!state.uiHidden && !state.opening && !busy && now - lastActivity > 4000) update({ uiHidden: true });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // hooks for automated visual checks
  (window as unknown as { __genesis: unknown }).__genesis = { scene, state, setSpeed, update, actions, send, skip: () => opening?.skip(), opening: () => opening };
}

boot().catch((err) => {
  console.error(err);
  fatal('Something went wrong while starting Genesis. Reloading the page usually fixes it.');
});
