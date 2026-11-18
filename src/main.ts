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
import { del, get, set } from 'idb-keyval';
import { Music } from './audio/music';
import type { SlotInfo, UIState } from './ui/store';
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
  scene.setPixelRatio(mobile ? 1 : 2);
  scene.plantBudget = mobile ? 15000 : 60000;
  scene.creatureBudget = mobile ? 1500 : 5000;
  update({ backend: scene.backend });
  progress(0.3);

  const grid = buildGrid();
  progress(0.45);
  let worker: Worker;
  const send = (m: ToWorker) => worker.postMessage(m);
  const music = new Music();
  let hushUntil = 0;
  let lastRecovery = 0;
  const autoKey = `genesis:auto:${seed}`;
  // a save to load as soon as the world is ready: a named slot (?slot=n) or this seed's autosave
  let pendingLoad: unknown = null;
  try {
    const slot = params.get('slot');
    const saved = params.has('fresh') ? null : slot ? await get(`genesis:slot:${slot}`) : await get(autoKey);
    if (saved && (saved as { seed?: string }).seed === seed) pendingLoad = saved;
    update({ slots: ((await get('genesis:slots')) as SlotInfo[] | undefined) ?? [] });
  } catch { /* storage unavailable: play without saves */ }
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

  // quality presets, and automatic step-downs when the frame rate sags
  const QUALITY: Record<UIState['quality'], { ratio: number; plants: number; creatures: number; bloom: boolean }> = {
    low: { ratio: 1, plants: 12000, creatures: 1200, bloom: false },
    medium: { ratio: 1.5, plants: 30000, creatures: 3000, bloom: true },
    high: { ratio: 2, plants: 60000, creatures: 5000, bloom: true },
    ultra: { ratio: 3, plants: 60000, creatures: 5000, bloom: true },
  };
  let adaptive = 0;
  const applyQuality = () => {
    const q = QUALITY[state.quality];
    const cut = adaptive >= 2 ? 0.5 : 1;
    scene.setPixelRatio(Math.max(0.75, q.ratio - (adaptive >= 3 ? 0.5 : 0) - (adaptive >= 4 ? 0.5 : 0)));
    scene.post.setBloom(q.bloom && adaptive < 1);
    if (scene.vegetation) scene.vegetation.maxInstances = Math.min(mobile ? 15000 : 60000, q.plants * cut);
    if (scene.creatures) scene.creatures.budget = Math.min(mobile ? 1500 : 5000, q.creatures * cut);
  };
  actions.setQuality = (q) => {
    adaptive = 0;
    update({ quality: q });
    store.set('genesis:quality', q);
    applyQuality();
  };
  actions.setMusicVolume = (v) => {
    update({ musicVolume: v });
    store.set('genesis:music', String(v));
    music.setVolume(v);
    void music.start();
  };
  actions.setReducedMotion = (on) => {
    update({ reducedMotion: on });
    store.set('genesis:motion', on ? '1' : '0');
    scene.cam.autoOrbit = on ? 0 : 0.012;
  };
  const savedQuality = store.get('genesis:quality') as UIState['quality'] | null;
  update({
    quality: savedQuality && QUALITY[savedQuality] ? savedQuality : mobile ? 'low' : 'high',
    musicVolume: Number(store.get('genesis:music') ?? 0.6),
    reducedMotion: store.get('genesis:motion') ? store.get('genesis:motion') === '1' : reducedMotion,
  });
  music.setVolume(state.musicVolume);
  const startMusic = () => { void music.start(); window.removeEventListener('pointerdown', startMusic); window.removeEventListener('keydown', startMusic); };
  window.addEventListener('pointerdown', startMusic);
  window.addEventListener('keydown', startMusic);

  // saved planets: ten named slots plus an autosave for each seed
  const writeSlots = (slots: SlotInfo[]) => { update({ slots }); void set('genesis:slots', slots).catch(() => {}); };
  actions.saveSlot = (name) => {
    const used = new Set(state.slots.map((x) => x.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    if (slot >= 10) return;
    send({ type: 'save', name, slot: String(slot) });
    writeSlots([...state.slots, { slot, name, seed, simYear: state.stats?.simYear ?? 0, savedAt: Date.now() }]);
    update({ notice: 'Planet saved.' });
    window.setTimeout(() => update({ notice: '' }), 2500);
  };
  actions.loadSlot = (slot) => {
    const info = state.slots.find((x) => x.slot === slot);
    if (!info) return;
    if (info.seed !== seed) { location.href = `${location.pathname}?seed=${encodeURIComponent(info.seed)}&slot=${slot}`; return; }
    void get(`genesis:slot:${slot}`).then((saved) => { if (saved) send({ type: 'load', save: saved }); });
  };
  actions.deleteSlot = (slot) => {
    void del(`genesis:slot:${slot}`).catch(() => {});
    writeSlots(state.slots.filter((x) => x.slot !== slot));
  };
  window.setInterval(() => { if (!state.opening && state.speedIndex > 0) send({ type: 'save', name: 'autosave', slot: 'auto' }); }, 120000);

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

  let lastHud = 0;
  const resetHistory = () => {
    state.events = [];
    state.chronicle = [];
    state.species = new Map();
    state.plants = new Map();
    toasts.length = 0;
    update({ whyEvent: -1, selectedSpecies: -1, creature: null, milestone: null });
    scene.creatures?.clear();
  };
  const takeEvents = (events: SimEvent[], live: boolean) => {
    for (const ev of events) {
      state.events[ev.id] = ev;
      // keep effect links current on the events we already hold
      for (const c of ev.causes) {
        const cause = state.events[c];
        if (cause && !cause.effects.includes(ev.id)) cause.effects.push(ev.id);
      }
      if (ev.importance >= 1 && ev.id > 0) state.chronicle.push(ev.id);
      if (!live) continue;
      if (ev.importance >= 3) toasts.push(ev);
      if (ev.type === 'impact') scene.flash(0.9);
      else if (ev.type === 'super-eruption') scene.flash(0.35);
      else if (ev.type === 'mass-extinction') hushUntil = performance.now() + 45000;
    }
    update({});
  };

  const onMessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready': {
        progress(0.9);
        if (!scene.planet) { scene.setGrid(grid, msg.seed); applyQuality(); }
        scene.applyCells(msg.cells, true);
        scene.applyStats(msg.stats);
        update({ stats: msg.stats });
        if (recovering) {
          // the scene already exists: just reload state and carry on at the same speed
          recovering = false;
          if (pendingLoad) send({ type: 'load', save: pendingLoad });
          pendingLoad = null;
          send({ type: 'speed', index: state.speedIndex });
          break;
        }
        opening = new Opening(scene, reducedMotion);
        opening.onChronicle = () => update({ chronicleLine: 'Year 0. The world is quiet. The water is warm.' });
        if (store.get(openedKey) === '1' || params.has('skip') || pendingLoad) opening.skip();
        if (pendingLoad) {
          send({ type: 'load', save: pendingLoad });
          pendingLoad = null;
        }
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
        // the HUD refreshes four times a second; the scene gets every update
        if (performance.now() - lastHud > 250) { lastHud = performance.now(); update({ stats: msg.stats, fps: scene.fpsAvg }); } else state.stats = msg.stats;
        music.setMood({ stage: msg.stats.stage, era: msg.stats.era, life: Math.min(1, msg.stats.livingSpecies / 30), hush: performance.now() < hushUntil });
        break;
      case 'events':
        takeEvents(msg.events, true);
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
      case 'saved': {
        const key = msg.slot === 'auto' ? autoKey : `genesis:slot:${msg.slot}`;
        void set(key, msg.save).catch(() => update({ notice: 'Could not save: browser storage is full or blocked.' }));
        break;
      }
      case 'loaded':
        resetHistory();
        takeEvents(msg.events.filter(Boolean), false);
        scene.applyCells(msg.cells, true);
        scene.applyStats(msg.stats);
        update({ stats: msg.stats });
        break;
      case 'error':
        console.error('sim worker:', msg.message);
        recover();
        break;
    }
  };
  const startWorker = () => {
    worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = onMessage;
    worker.onerror = (e) => { console.error('worker error', e.message); recover(); };
    send({ type: 'init', seed });
  };
  // if the simulation crashes, restart it from the last autosave rather than leave a frozen planet
  const recover = () => {
    const now = performance.now();
    if (now - lastRecovery < 30000) {
      update({ notice: 'The simulation keeps failing. Reload the page to restart it.' });
      return;
    }
    lastRecovery = now;
    worker.terminate();
    void get(autoKey).catch(() => null).then((saved) => {
      pendingLoad = saved ?? null;
      recovering = true;
      startWorker();
      update({ notice: saved ? 'The simulation stumbled. Restored from the last autosave.' : 'The simulation stumbled and was restarted.' });
      window.setTimeout(() => update({ notice: '' }), 6000);
    });
  };
  let recovering = false;
  startWorker();
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
  let slowFor = 0;
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
      // adaptive quality: two seconds under target steps down bloom, then instance counts, then resolution
      const target = mobile ? 26 : 50;
      if (!state.opening && scene.fpsAvg < target && document.visibilityState === 'visible') {
        slowFor += dt;
        if (slowFor > 2 && adaptive < 4) { adaptive++; slowFor = 0; applyQuality(); }
      } else slowFor = 0;
      scene.cam.autoOrbit = state.reducedMotion ? 0 : state.postcard ? 0.035 : 0.012;
      const busy = state.panel !== 'none' || state.whyEvent >= 0 || state.selectedSpecies >= 0;
      if (!state.uiHidden && !state.opening && !busy && now - lastActivity > 4000) update({ uiHidden: true });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // hooks for automated visual checks
  // grab the 3D canvas straight after a render (cheap way to capture frames in automated checks)
  const grab = () => { scene.frame(0); return canvas.toDataURL('image/jpeg', 0.9); };
  (window as unknown as { __genesis: unknown }).__genesis = { scene, state, setSpeed, update, actions, send, grab, skip: () => opening?.skip(), opening: () => opening };
}

boot().catch((err) => {
  console.error(err);
  fatal('Something went wrong while starting Genesis. Reloading the page usually fixes it.');
});
