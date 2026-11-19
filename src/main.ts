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
import { placeName } from './sim/names';
import { RNG } from './sim/rng';
import { nearestCell } from './sim/world';
import { GENE_COUNT, G } from './sim/genetics';
import { formatYear } from './ui/format';
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
  // development switches for slow machines: smaller planet maps and a shorter erosion bake
  if (params.get('dsize')) scene.dataSize = Number(params.get('dsize'));
  if (params.get('esize')) scene.erosionSize = Number(params.get('esize'));
  if (params.get('eiter')) scene.erosionIterations = Number(params.get('eiter'));
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
  let lastRecovery = -Infinity;
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
    scene.post.allowDof = state.quality !== 'low' && adaptive < 2;
    if (scene.vegetation) scene.vegetation.maxInstances = Math.min(mobile ? 15000 : 60000, q.plants * cut);
    if (scene.creatures) scene.creatures.budget = Math.min(mobile ? 1500 : 5000, q.creatures * cut);
    // blurred glass panels are costly on weak GPUs: use plain dark panels below the high preset
    document.documentElement.classList.toggle('lite', state.quality === 'low' || state.quality === 'medium' || adaptive >= 1);
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
  actions.setSoundVolume = (v) => { update({ soundVolume: v }); store.set('genesis:sound', String(v)); music.sfx = v; void music.start(); };
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
  update({ soundVolume: Number(store.get('genesis:sound') ?? 0.7) });
  music.sfx = state.soundVolume;
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

  const fossilCells = () => [...state.species.values()].filter((x) => x.extinctYear >= 0 && x.peakPop > 2e4).map((x) => x.homeCell);
  actions.setOverlay = (o) => {
    update({ overlay: o });
    scene.setOverlay(o === 'fossils' ? 'none' : o, state.colorblind);
    scene.setFossils(fossilCells(), o === 'fossils');
  };
  actions.setColorblind = (on) => { update({ colorblind: on }); store.set('genesis:cb', on ? '1' : '0'); scene.setOverlay(state.overlay === 'fossils' ? 'none' : state.overlay, on); };
  actions.fork = () => { send({ type: 'fork' }); update({ notice: 'Fork point saved. Rewind to it from this panel.' }); window.setTimeout(() => update({ notice: '' }), 3000); };
  // a small invented family for an individual, stable for as long as it is on screen
  actions.familyOf = (key) => {
    const r = new RNG((key * 40503) >>> 0);
    const mother = placeName(r), father = placeName(r);
    return [`mother ${mother}, father ${father}`, `grandmothers ${placeName(r)} and ${placeName(r)}`, `${1 + r.int(5)} siblings, ${r.int(4)} young`];
  };
  // cross-section: a west-to-east slice through the ground under the centre of the view
  actions.drawSection = (cv) => {
    const cells = scene.vegetationCells();
    const ctx = cv.getContext('2d');
    if (!cells || !ctx) return;
    const W = cv.width, H = cv.height;
    scene.cam.focusDir(focusVec);
    const east = new Vector3(-focusVec.z, 0, focusVec.x).normalize();
    const span = Math.min(0.5, 0.06 + scene.cam.dist * 0.25);
    const yOf = (km: number) => H * 0.52 - km * (H / 16);
    ctx.fillStyle = '#0b0e16'; ctx.fillRect(0, 0, W, H);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, yOf(0)); sky.addColorStop(0, '#10182c'); sky.addColorStop(1, '#3b5f8f');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, yOf(cells.seaLevel));
    let c = scene.cellAt(focusVec.x, focusVec.y, focusVec.z);
    const p = new Vector3();
    const col: { e: number; veg: number; snow: number; canopy: number; lava: number }[] = [];
    for (let x = 0; x < W; x += 2) {
      p.copy(focusVec).addScaledVector(east, (x / W - 0.5) * 2 * span).normalize();
      c = nearestCell(grid, p.x, p.y, p.z, c);
      col.push({ e: cells.elevation[c]!, veg: cells.vegetation[c]!, snow: cells.snow[c]!, canopy: cells.canopy[c]!, lava: cells.lava[c]! });
    }
    // water
    ctx.fillStyle = '#1b4f7a'; ctx.fillRect(0, yOf(cells.seaLevel), W, H);
    col.forEach((k, i) => {
      const x = i * 2, top = yOf(k.e);
      // rock strata: bands that follow the surface loosely, darker with depth
      const layers = ['#8b7355', '#6f5d4a', '#5a4b40', '#463c36', '#352e2c', '#5b2a1c'];
      layers.forEach((color, li) => { ctx.fillStyle = color; const y0 = top + li * 22 + Math.sin(i * 0.05 + li) * 5 * li; ctx.fillRect(x, li === 0 ? top : y0, 2, H); });
      // caves: hollows in the second layer
      if (k.e > cells.seaLevel && Math.sin(i * 0.37) * Math.sin(i * 0.11 + 2) > 0.72) { ctx.fillStyle = '#14100e'; ctx.fillRect(x, top + 30 + Math.sin(i * 0.2) * 6, 2, 7); }
      if (k.lava > 0.3) { ctx.fillStyle = '#ff7a2a'; ctx.fillRect(x, top, 2, 40); }
      if (k.e > cells.seaLevel) {
        // soil, roots and what grows on top
        if (k.veg > 0.05) { ctx.fillStyle = '#3d2f22'; ctx.fillRect(x, top, 2, 3 + k.veg * 4); ctx.fillStyle = '#6d5a3a'; if (i % 5 === 0) ctx.fillRect(x, top + 2, 1, 4 + k.canopy * 18); }
        if (k.veg > 0.1) { ctx.fillStyle = k.canopy > 0.45 ? '#2f7a3c' : '#7fae4a'; ctx.fillRect(x, top - 2 - k.canopy * 16 * k.veg, 2, 2 + k.canopy * 16 * k.veg); }
        if (k.snow > 1) { ctx.fillStyle = '#eef4fb'; ctx.fillRect(x, top - Math.min(14, k.snow * 0.5), 2, Math.min(14, k.snow * 0.5)); }
      }
    });
    ctx.fillStyle = '#ece7dbaa'; ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText('west', 8, 16); ctx.fillText('east', W - 38, 16); ctx.fillText('sea level', 8, yOf(cells.seaLevel) - 4);
  };
  actions.rewind = (index) => send({ type: 'rewind', index });
  update({ colorblind: store.get('genesis:cb') === '1' });

  // flat map: an equirectangular picture of the planet as it is painted right now
  let mapCells: Int32Array | null = null;
  actions.drawMap = (cv) => {
    const colors = scene.planet?.cellColors;
    const ctx = cv.getContext('2d');
    if (!colors || !ctx) return;
    const W = cv.width, H = cv.height;
    if (!mapCells) {
      mapCells = new Int32Array(W * H);
      let c = 0;
      for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        for (let x = 0; x < W; x++) {
          const lon = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
          c = nearestCell(grid, Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), c);
          mapCells[y * W + x] = c;
        }
      }
    }
    const img = ctx.createImageData(W, H);
    const sea = state.stats?.seaLevel ?? 0;
    const elev = scene.planet!.elevation;
    for (let i = 0; i < W * H; i++) {
      const c = mapCells[i]!;
      const wet = elev[c]! <= sea && state.overlay === 'none';
      // linear to display, with the sea drawn in blue by depth
      const r = wet ? 0.02 : colors[c * 3]!, g = wet ? 0.1 + Math.max(0, 0.25 + elev[c]! * 0.06) : colors[c * 3 + 1]!, b = wet ? 0.3 + Math.max(0, 0.3 + elev[c]! * 0.06) : colors[c * 3 + 2]!;
      img.data[i * 4] = Math.pow(Math.min(1, r), 0.45) * 255;
      img.data[i * 4 + 1] = Math.pow(Math.min(1, g), 0.45) * 255;
      img.data[i * 4 + 2] = Math.pow(Math.min(1, b), 0.45) * 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // settlements as warm dots
    ctx.fillStyle = '#ffd27a';
    for (const st of state.settlements) {
      if (st.ruined >= 0) continue;
      const x = ((grid.lon[st.cell]! + Math.PI) / (Math.PI * 2)) * W, y = (0.5 - grid.lat[st.cell]! / Math.PI) * H;
      ctx.fillRect(x - 1, y - 1, st.tech > 0.6 ? 3 : 2, st.tech > 0.6 ? 3 : 2);
    }
  };
  actions.mapClick = (u, v) => {
    scene.cam.flyTo(u * Math.PI * 2 - Math.PI, (0.5 - v) * Math.PI, Math.min(scene.cam.dist, 1.4));
    scene.cam.idle = 0;
  };

  // photo mode, video recording and the history book
  const FILTERS: Record<string, string> = { none: 'none', vivid: 'saturate(1.45) contrast(1.08)', faded: 'saturate(0.6) contrast(0.9) brightness(1.08)', sepia: 'sepia(0.75) contrast(1.05)', noir: 'grayscale(1) contrast(1.25)' };
  const download = (url: string, name: string) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); };
  const snapshot = (): string => {
    scene.frame(0);
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.filter = FILTERS[state.photoFilter] ?? 'none';
    ctx.drawImage(canvas, 0, 0);
    return out.toDataURL('image/png');
  };
  actions.setPhotoFilter = (f) => { update({ photoFilter: f }); canvas.style.filter = FILTERS[f] ?? 'none'; };
  actions.savePhoto = () => download(snapshot(), `genesis-${seed}-${Math.round((state.stats?.simYear ?? 0) / 1e6)}My.png`);
  let recorder: MediaRecorder | null = null;
  actions.toggleRecording = () => {
    if (recorder) { recorder.stop(); return; }
    try {
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => { download(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), `genesis-${seed}.webm`); recorder = null; update({ recording: false }); };
      recorder.start();
      update({ recording: true });
    } catch { update({ notice: 'This browser cannot record video here.' }); window.setTimeout(() => update({ notice: '' }), 3500); }
  };
  actions.exportBook = () => {
    const esc = (t: string) => t.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!);
    const chapters = state.chronicle.map((id) => state.events[id]!).filter((e) => e.importance >= 2);
    const living = [...state.species.values()].filter((x) => x.extinctYear < 0).length;
    const rows = chapters.map((e) => `<section class="${e.importance >= 3 ? 'big' : ''}"><div class="when">${esc(formatYear(e.simYear))}</div><h2>${esc(e.title)}</h2><p>${esc(e.description)}</p></section>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>A history of ${esc(seed)}</title><style>
      body{font:17px/1.55 'Cormorant Garamond',Georgia,serif;color:#1c1a17;max-width:38em;margin:3em auto;padding:0 1.5em}
      h1{font-size:2.6em;letter-spacing:.06em;margin:.2em 0 0}h2{font-size:1.25em;margin:.1em 0}.when{font:11px monospace;letter-spacing:.1em;color:#7a7468;text-transform:uppercase}
      section{margin:1.4em 0;break-inside:avoid}section.big h2{font-size:1.7em}img{width:100%;border-radius:6px;margin:1.2em 0}p{margin:.2em 0}.lead{font-style:italic;color:#4d483f}
    </style></head><body><h1>GENESIS</h1><p class="lead">A history of the world called ${esc(seed)}, from its forming to ${esc(formatYear(state.stats?.simYear ?? 0).toLowerCase())}. ${state.species.size} kinds of animal are named in it; ${living} are still alive.</p>
    <img src="${snapshot()}" alt="The planet">${rows}<p class="lead">Every event in this book happened on its own. Nothing was scripted.</p></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { download(URL.createObjectURL(new Blob([html], { type: 'text/html' })), `genesis-${seed}-history.html`); return; }
    w.document.write(html);
    w.document.close();
    w.setTimeout(() => w.print(), 600);
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

  let lastHud = 0;
  const resetHistory = () => {
    state.events = [];
    state.chronicle = [];
    state.species = new Map();
    state.plants = new Map();
    toasts.length = 0;
    state.history = [];
    update({ whyEvent: -1, selectedSpecies: -1, creature: null, milestone: null, settlements: [] });
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
      // documentary director: cut to wherever something notable just happened
      if ((state.director || state.postcard) && ev.importance >= 2 && ev.cellId >= 0 && scene.following === null) actions.flyToCell(ev.cellId, 0.9);
      if (ev.type === 'impact') { scene.flash(0.9); scene.impactAt(ev.cellId); }
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
          // with no autosave to fall back on, the world starts over: clear the old history from the panels
          if (!pendingLoad) { resetHistory(); scene.applyCells(msg.cells, true); }
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
        // once faded, take the overlay out of the page entirely so it costs nothing to composite
        window.setTimeout(() => { bootEl.style.display = 'none'; }, 2200);
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
        {
          const st = msg.stats, h = state.history;
          const lastYear = h.length ? h[h.length - 1]!.year : -1;
          if (st.simYear - lastYear > Math.max(2e5, st.simYear / 240)) {
            h.push({ year: st.simYear, temp: st.meanTemp, oxygen: st.oxygen, species: st.livingSpecies, pop: st.population, land: st.landCover, toxin: st.plantToxin, resist: st.toxinResist });
            if (h.length > 480) h.splice(0, h.length - 480);
          }
        }
        music.setCivMusic(msg.stats.civMusic && msg.stats.settlements > 0, seed.length * 7919 + seed.charCodeAt(0));
        music.setMood({ stage: msg.stats.stage, era: msg.stats.era, life: Math.min(1, msg.stats.livingSpecies / 30), hush: performance.now() < hushUntil });
        break;
      case 'events':
        takeEvents(msg.events, true);
        break;
      case 'species':
        for (const sp of msg.species) state.species.set(sp.id, sp);
        scene.setSpecies(state.species);
        scene.setFossils(fossilCells(), state.overlay === 'fossils');
        update({});
        break;
      case 'settlements':
        update({ settlements: msg.settlements });
        break;
      case 'timeline':
        update({ timeline: msg.points });
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
    if (!state.godTool) {
      const ind = scene.pickCreature(x, y);
      const info = ind ? state.species.get(ind.species) : undefined;
      if (ind && info) {
        const d = describeIndividual(ind, info);
        update({ creature: { key: ind.key, species: ind.species, ...d, following: double }, selectedSpecies: -1, whyEvent: -1 });
        music.call(info.genes[G.Size]!);
        if (double) scene.follow(ind.key);
        return;
      }
    }
    if (state.godTool && !state.handsOff) {
      const hit = scene.pick(x, y);
      if (hit) {
        const genes = state.godTool === 'species' ? Array.from({ length: GENE_COUNT }, (_, i) => state.design[i] ?? 0.3) : undefined;
        send({ type: 'god', tool: state.godTool, cell: scene.cellAt(hit.x, hit.y, hit.z), power: 0.8, genes });
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
    else if (k === 'm') togglePanel('map');
    else if (k === 'x') togglePanel('section');
    else if (k === 'u') { scene.underwater = !scene.underwater; update({ notice: scene.underwater ? 'Diving allowed: zoom in over the sea to go under.' : '' }); window.setTimeout(() => update({ notice: '' }), 2500); }
    else if (k === 'v') scene.firstPerson = !scene.firstPerson;
    else if (k === 'o') { const order = ['none', 'temp', 'rain', 'life', 'people', 'fossils'] as const; actions.setOverlay(order[(order.indexOf(state.overlay) + 1) % order.length]!); }
    else if (k === 'f') { if (state.creature) actions.followCreature(!state.creature.following); }
    else if (k === 'escape' && scene.following !== null) actions.followCreature(false);
    else if (k === 'escape') { if (state.postcard) update({ postcard: false }); else closeAll(); }
  });
  window.addEventListener('resize', () => scene.resize());

  let lastFocus = 0;
  let slowFor = 0;
  let postcardBase = 0;
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
        // ambient sound: wind aloft, surf near water, rain under storm cloud
        const here = scene.cellAt(focusVec.x, focusVec.y, focusVec.z);
        const cellsNow = scene.vegetationCells();
        const near = Math.max(0, 1 - scene.cam.dist / 0.5);
        const wet = cellsNow ? cellsNow.elevation[here]! <= cellsNow.seaLevel + 0.05 : false;
        const rain = cellsNow ? Math.max(0, cellsNow.cloud[here]! - 0.75) * 4 : 0;
        music.ambience(Math.min(1, scene.cam.dist) * 0.5 + 0.1, wet ? near : near * 0.2, Math.min(1, rain) * near);
        if (rain > 0.2 && near > 0.2 && Math.random() < 0.12) music.thunder();
      }
      // adaptive quality: two seconds under target steps down bloom, then instance counts, then resolution
      const target = mobile ? 26 : 50;
      if (!state.opening && scene.fpsAvg < target && document.visibilityState === 'visible') {
        slowFor += dt;
        if (slowFor > 2 && adaptive < 4) { adaptive++; slowFor = 0; applyQuality(); }
      } else slowFor = 0;
      scene.cam.autoOrbit = state.reducedMotion ? 0 : state.postcard ? 0.035 : 0.012;
      // postcard mode: a slow cinematic drift in and out, with depth of field up close
      scene.cinematic = state.postcard;
      if (state.postcard && !state.reducedMotion && scene.following === null) {
        if (postcardBase === 0) postcardBase = scene.cam.dist;
        scene.cam.zoomTo(postcardBase * (1 + 0.28 * Math.sin(now / 9000)));
        scene.cam.idle = 100;
      } else postcardBase = 0;
      const busy = state.panel !== 'none' || state.whyEvent >= 0 || state.selectedSpecies >= 0;
      if (!state.uiHidden && !state.opening && !busy && now - lastActivity > 4000) update({ uiHidden: true });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // hooks for automated visual checks
  // grab the 3D canvas straight after a render (cheap way to capture frames in automated checks)
  const grab = () => { scene.frame(0); return canvas.toDataURL('image/jpeg', 0.9); };
  (window as unknown as { __genesis: unknown }).__genesis = { scene, state, setSpeed, update, actions, send, grab, music, skip: () => opening?.skip(), opening: () => opening };
}

boot().catch((err) => {
  console.error(err);
  fatal('Something went wrong while starting Genesis. Reloading the page usually fixes it.');
});
