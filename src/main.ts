import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import { h, render } from 'preact';
import { GenesisScene, PRESETS, type Preset } from './render/scene';
import { encodeGif } from './util/gif';
import { PdfDoc, wrapText } from './util/pdf';
import { Opening } from './render/opening';
import { buildGrid } from './sim/world';
import { randomSeedCode } from './sim/rng';
import type { SimEvent } from './sim/events';
import { SPEEDS, type FromWorker, type SettlementInfo, type ToWorker } from './shared/protocol';
import { App } from './ui/App';
import { closeAll } from './ui/panels';
import { describeIndividual } from './render/creatures';
import { placeName } from './sim/names';
import { RNG } from './sim/rng';
import { nearestCell } from './sim/world';
import { GENE_COUNT, G } from './sim/genetics';
import { formatYear, bigNumber } from './ui/format';
import { Vector3 } from 'three/webgpu';
import { del, get, set } from 'idb-keyval';
import { Music } from './audio/music';
import { believedSpot, describeMap, knownAt } from './sim/history/worldmap';
import { feastOf, festivalOn } from './sim/history/festival';
import { GOOD_COLOUR } from './sim/history/trade';
import { IDEA_COLOUR, IDEA_LABEL, type Idea } from './sim/history/ideology';
import type { SlotInfo, UIState } from './ui/store';
import { GOALS, emptyRecord, evaluateGoals, type GoalRecord } from './game/goals';
import { planFilm, shotAt, type Shot } from './game/film';
import { vision } from './sim/senses';
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
    // the asset pass: `&noassets` draws everything from generated shapes; `&plantmodel=form:file` tries one file as one form
    if (params.has('noassets')) scene.useAssets = false;
    for (const pair of params.getAll('plantmodel')) { const [form, file] = pair.split(':'); if (form && file) scene.plantModelOverride[form] = pair.slice(form.length + 1); }
    await scene.init();
  } catch (err) {
    console.error(err);
    fatal('Genesis needs WebGPU or WebGL2 to draw its planet. Please open it in a recent version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  // A phone's screen is small and dense: at a pixel ratio of 1 the planet is drawn at a third of the screen's own
  // sharpness and looks blurred beside the text (GPU review, phone shapes). A small screen has few pixels to fill, so
  // it can afford more per pixel: the ratio is raised until the picture is about 0.7 million pixels, never past 2 or
  // past what the screen has. A tablet is already over that and is left alone. Slow frames still step it back down.
  function sharpEnough(ratio: number): number {
    if (!mobile) return ratio;
    return Math.max(ratio, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(700_000 / Math.max(1, innerWidth * innerHeight))));
  }
  // the quality preset decides texture and buffer sizes when the planet is built
  {
    const saved = store.get('genesis:quality') as Preset | null;
    const preset: Preset = saved && PRESETS[saved] ? saved : mobile ? 'low' : 'high';
    scene.presetForBuild(preset);
    scene.setPixelRatio(sharpEnough(PRESETS[preset].ratio));
  }
  if (params.get('dsize')) scene.dataSize = Number(params.get('dsize'));
  if (params.get('esize')) scene.erosionSize = Number(params.get('esize'));
  if (params.get('eiter')) scene.erosionIterations = Number(params.get('eiter'));
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
  /** The name of a language the panel was asked to open before the list of languages had arrived. */
  let pendingTongue = '';
  /** A festival asked for from a panel: whose, which, and until when (page clock) its lights are shown whatever the day. */
  let shownFeast: { nation: number; festival: number; until: number } | null = null;
  /** Until when (page clock) a people's music asked for from a panel keeps playing whatever is in view. */
  let listening = 0;
  try {
    const slot = params.get('slot');
    const saved = params.has('fresh') ? null : slot ? await get(`genesis:slot:${slot}`) : await get(autoKey);
    if (saved && (saved as { seed?: string }).seed === seed) pendingLoad = saved;
    update({ slots: ((await get('genesis:slots')) as SlotInfo[] | undefined) ?? [] });
  } catch { /* storage unavailable: play without saves */ }
  // the other future: a second simulation started from a fork of this one, running alongside
  let altWorker: Worker | null = null;
  let opening: Opening | null = null;
  let started = false;

  const setSpeed = (index: number) => {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, index));
    if (i > 0) state.lastSpeedIndex = i;
    update({ speedIndex: i });
    send({ type: 'speed', index: i });
    altWorker?.postMessage({ type: 'speed', index: i });
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
  // optional goals: judged about once a second from what the page already knows; nothing in the simulation depends on them
  const goalRecord: GoalRecord = (() => {
    try { return { ...emptyRecord(), ...(JSON.parse(store.get('genesis:goals') ?? '{}') as Partial<GoalRecord>) }; } catch { return emptyRecord(); }
  })();
  const saveGoals = () => store.set('genesis:goals', JSON.stringify(goalRecord));
  const judgeGoals = () => {
    if (!state.stats || state.opening) return;
    const nations = state.realms.length ? state.realms.filter((r) => r.ended < 0).length : state.nations.length;
    const before = JSON.stringify(goalRecord.memo);
    const { states, fresh } = evaluateGoals({ stats: state.stats, species: state.species, settlements: state.settlements, events: state.events, nations }, goalRecord, seed);
    update({ goals: states, goalsDone: { ...goalRecord.done }, goalTracked: goalRecord.tracked });
    if (fresh.length || before !== JSON.stringify(goalRecord.memo)) saveGoals();
    if (fresh.length) {
      const names = fresh.map((id) => GOALS.find((g) => g.id === id)!.title);
      const text = `Goal reached: ${names.join(', ')}.`;
      update({ notice: text });
      window.setTimeout(() => { if (state.notice === text) update({ notice: '' }); }, 6000);
    }
  };
  window.setInterval(judgeGoals, 1000);
  // the planet's pulse, heard: two soft thuds a beat, louder the worse things are, silent when all is well
  update({ pulseSound: store.get('genesis:pulse') !== '0' });
  actions.setPulseSound = (on) => { update({ pulseSound: on }); store.set('genesis:pulse', on ? '1' : '0'); };
  const heartbeat = () => {
    const st = state.stats;
    const rate = st?.pulseRate ?? 60, health = st?.health ?? 1;
    if (state.pulseSound && st && !state.opening && health < 0.8 && st.yearsPerSecond > 0) music.beat(Math.min(1, (0.8 - health) * 2.2));
    window.setTimeout(heartbeat, 60000 / Math.max(30, Math.min(160, rate)));
  };
  window.setTimeout(heartbeat, 2000);
  actions.trackGoal = (id) => { goalRecord.tracked = id; saveGoals(); judgeGoals(); update({ goalTracked: id }); };
  actions.resetGoals = () => { goalRecord.done = {}; goalRecord.memo = {}; saveGoals(); judgeGoals(); };
  actions.copySeedLink = () => {
    const linked = params.get('neighbor');
    const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(seed)}${linked ? `&neighbor=${encodeURIComponent(linked)}` : ''}`;
    void navigator.clipboard?.writeText(url).then(() => {
      update({ notice: 'Link copied. Anyone who opens it gets this same world.' });
      window.setTimeout(() => update({ notice: '' }), 3500);
    });
  };
  actions.newWorld = (s) => {
    location.href = `${location.pathname}?seed=${encodeURIComponent(s ?? randomSeedCode((Math.random() * 2 ** 32) >>> 0))}`;
  };

  // quality presets, and automatic step-downs when the frame rate sags
  const QUALITY = PRESETS;
  let adaptive = 0;
  const applyQuality = () => {
    const q = PRESETS[state.quality];
    // Step-downs in the order that costs the picture least. Measured on a real GPU (docs/GPU_REVIEW.md): the cloud
    // march is over half the frame above Low, and at a pixel ratio of 2 everything else alone misses the target, so
    // the first steps thin the march and take half a step of resolution, and anti-aliasing is the last thing to go.
    //   1 fewer cloud and aurora steps   2 resolution down half a step   3 fewer steps still, half the plants and animals
    //   4 no bloom or ambient occlusion   5 no anti-aliasing, resolution down again
    const march = adaptive >= 3 ? 0.45 : adaptive >= 1 ? 0.65 : 1;
    const cut = adaptive >= 3 ? 0.5 : 1;
    // start from what the screen can show: a preset that asks for more than the display has must still step down
    const ratio = Math.min(window.devicePixelRatio || 1, sharpEnough(q.ratio));
    scene.setPixelRatio(Math.max(0.75, ratio - (adaptive >= 2 ? 0.5 : 0) - (adaptive >= 5 ? 0.5 : 0)));
    scene.presetLive(state.quality, cut, false, march);
    // the lens fringe goes with anti-aliasing: on hard, aliased edges it reads as red and blue outlines
    scene.post.set({ bloom: q.bloom && adaptive < 4, taa: q.taa && adaptive < 5, ao: q.ao && adaptive < 4, fringe: q.fringe && adaptive < 5 });
    scene.post.allowDof = state.quality !== 'low' && adaptive < 4;
    // blurred glass panels are costly on weak GPUs: use plain dark panels below the high preset
    document.documentElement.classList.toggle('lite', state.quality === 'low' || state.quality === 'medium' || adaptive >= 4);
  };
  // The step this machine settled on is remembered for each preset, so the next visit starts there instead of
  // running slowly for several seconds while it finds the same answer again.
  const stepKey = () => `genesis:steps:${state.quality}`;
  const rememberSteps = () => store.set(stepKey(), String(adaptive));
  actions.setQuality = (q) => {
    // choosing a preset by hand asks for all of it: start again from the top
    adaptive = 0;
    update({ quality: q });
    store.set('genesis:quality', q);
    rememberSteps();
    applyQuality();
    // texture sizes were fixed when the planet was built: say so if the new preset wants different ones
    if (q !== scene.builtWith) { update({ notice: 'Some of this preset (texture detail, wave and cloud resolution) takes effect after a reload.' }); window.setTimeout(() => update({ notice: '' }), 6000); }
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
  adaptive = Math.max(0, Math.min(5, Math.round(Number(store.get(stepKey()) ?? 0)) || 0));
  if (params.has('noadapt')) adaptive = 0;
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
  scene.onNations = (nations) => update({ nations });
  actions.project = (x, y, z) => scene.projectDir(x, y, z);
  actions.disc = () => scene.discOnScreen();
  actions.construction = (id) => scene.construction(id);
  actions.architecture = (st) => scene.architecture(st);
  actions.cellDir = (cell) => { const p = grid.pos; return [p[cell * 3]!, p[cell * 3 + 1]!, p[cell * 3 + 2]!]; };
  actions.timelapse = (id, cell) => { actions.flyToCell(cell, 0.045); update({ panel: 'none' }); window.setTimeout(() => scene.timelapse(id), 1800); };
  actions.openSite = (id) => { update({ panel: 'site', siteDetail: state.siteDetail?.id === id ? state.siteDetail : null }); send({ type: 'requestSite', id }); };
  actions.listen = (id) => { const r = state.realms.find((x) => x.id === id); if (!r || !r.music) return; void music.start().then(() => { music.setTownMusic(r.music!.tradition, r.era, 1); listening = performance.now() + 30000; }); };
  // festival nights (system E30): the towns of a country keeping one of its days are lit differently. Days go by
  // too fast to see above a day a second, so yearly festivals show only at that pace or slower; the comet's whole
  // year shows up to a few years a second; one asked for from a panel shows for a while at any pace. (On the page's
  // own clock, not when figures arrive from the simulation: a paused world sends few, and a festival asked for
  // while paused must still light up.)
  window.setInterval(() => {
    const stats = state.stats;
    if (!stats || !scene.civ) return;
    const feasts = new Map<number, ReturnType<typeof feastOf>>();
    const pace = stats.yearsPerSecond, year = stats.simYear, now = performance.now();
    for (const r of state.realms) {
      if (r.ended >= 0 || !r.festivals) continue;
      const on = r.festivals.find((f) => shownFeast && shownFeast.nation === r.id && shownFeast.festival === f.id && now < shownFeast.until) ?? r.festivals.find((f) => festivalOn(f, year) && pace <= (f.every > 1 ? 3 : 0.02));
      if (on) feasts.set(r.id, feastOf(on.light, r.hue));
    }
    scene.civ.setFeasts(feasts);
  }, 500);
  actions.showFestival = (nation, festival) => { shownFeast = { nation, festival, until: performance.now() + 20000 }; const r = state.realms.find((x) => x.id === nation); const cap = r ? state.settlements.find((t) => t.id === r.capital) : undefined; if (cap) { update({ panel: 'none' }); scene.cam.flyTo(grid.lon[cap.cell]!, grid.lat[cap.cell]!, 1.1); } };
  actions.openDiplomacy = () => { update({ panel: 'diplomacy' }); send({ type: 'requestDiplomacy' }); };
  actions.openWars = () => { update({ panel: 'map', mapOf: -3 }); send({ type: 'requestWars' }); };
  actions.openPlagues = () => { update({ panel: 'map', mapOf: -6 }); send({ type: 'requestPlagues' }); };
  actions.openMarket = () => { update({ panel: 'market' }); send({ type: 'requestMarket' }); };
  actions.openLegends = () => { update({ panel: 'legends' }); send({ type: 'requestLegends' }); };
  actions.openGallery = () => { update({ panel: 'gallery' }); send({ type: 'requestGallery' }); };
  actions.openLanguages = (name) => {
    const known = name ? state.languages?.list.find((l) => l.name === name) : undefined;
    pendingTongue = known || !name ? '' : name;
    update({ panel: 'tongues', tongue: known ? known.id : name ? state.tongue : -1 });
    send({ type: 'requestLanguages' });
  };
  actions.openDynasty = (id) => { update({ panel: 'dynasty', dynastyDetail: state.dynastyDetail?.id === id ? state.dynastyDetail : null }); send({ type: 'requestDynasty', id }); };
  // the record (expansion Section 6)
  actions.askMemory = (ask) => send({ type: 'requestMemory', ask });
  actions.openArticle = (ref) => {
    const trail = state.memTrail.length && state.memTrail[state.memTrail.length - 1]!.kind === ref.kind && state.memTrail[state.memTrail.length - 1]!.id === ref.id ? state.memTrail : [...state.memTrail, ref].slice(-40);
    update({ panel: 'archive', memTab: 'archive', memTrail: trail, whyEvent: -1 });
    send({ type: 'requestMemory', ask: { what: 'article', kind: ref.kind, id: ref.id } });
  };
  /** The towns as the scene should draw them: the one under the chronoscope as it stood in the year on the dial. */
  const withPast = (list: SettlementInfo[]): SettlementInfo[] => {
    const c = state.chrono, p = state.memPlace;
    if (!c || !p || p.id !== c.id || p.year >= p.until) return list;
    return list.map((st) => (st.id === p.id ? { ...st, tech: p.tech, pop: p.pop, peak: p.pop, ruined: p.standing ? -1 : st.ruined, walls: undefined, wonders: undefined, monuments: 0, links: undefined, dam: false, mine: false, relic: undefined } : st));
  };
  actions.setChrono = (id, year) => {
    if (year === null) { update({ chrono: null, memPlace: null }); scene.setSettlements(state.settlements, state.realms); return; }
    update({ chrono: { id, year } });
    send({ type: 'requestMemory', ask: { what: 'place', id, year } });
  };
  actions.openNation = (id) => { update({ panel: 'nation', nationDetail: state.nationDetail?.id === id ? state.nationDetail : null }); send({ type: 'requestNation', id }); };
  actions.setOverlay = (o) => {
    update({ overlay: o });
    scene.setNightMap(o === 'nations');
    scene.setOverlay(o === 'fossils' || o === 'nations' || o === 'fungal' || o === 'diversity' || o === 'oxygen' ? 'none' : o, state.colorblind);
    scene.setFungalView(o === 'fungal', state.plants);
    if (o === 'diversity' || o === 'oxygen') send({ type: 'requestLayer', kind: o }); else scene.setLayerOverlay(null);
    scene.setFossils(fossilCells(), o === 'fossils');
  };
  actions.setColorblind = (on) => { update({ colorblind: on }); store.set('genesis:cb', on ? '1' : '0'); scene.setOverlay(['fossils', 'nations', 'fungal', 'diversity', 'oxygen'].includes(state.overlay) ? 'none' : (state.overlay as 'none' | 'temp' | 'rain' | 'life' | 'people'), on); };
  actions.fork = () => {
    send({ type: 'fork' });
    if (mobile) { update({ notice: 'Fork point saved. Rewind to it from this panel.' }); window.setTimeout(() => update({ notice: '' }), 3000); return; }
    // on a desktop the fork really runs: this world is copied and the copy sets off on its own
    send({ type: 'save', name: 'fork', slot: 'fork' });
    update({ notice: 'The timeline forks here. A second future is now running beside this one.' });
    window.setTimeout(() => update({ notice: '' }), 5000);
  };
  const startOtherFuture = (save: unknown) => {
    altWorker?.terminate();
    const forkedAt = state.stats?.simYear ?? 0;
    update({ other: { stats: null, events: [], forkedAt } });
    const w = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
    altWorker = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (altWorker !== w || !state.other) return;
      if (m.type === 'ready') { w.postMessage({ type: 'load', save, diverge: true }); w.postMessage({ type: 'speed', index: state.speedIndex }); w.postMessage({ type: 'settings', slowOnEvents: false }); }
      else if (m.type === 'stats') { if (performance.now() - lastOther > 400) { lastOther = performance.now(); update({ other: { ...state.other, stats: m.stats } }); } else state.other.stats = m.stats; }
      else if (m.type === 'events') { const fresh = m.events.filter((ev) => ev.importance >= 2 && ev.simYear >= state.other!.forkedAt); if (fresh.length) update({ other: { ...state.other, events: [...state.other.events, ...fresh].slice(-6) } }); }
      else if (m.type === 'saved' && m.slot === 'cross') { crossSaves.theirs = m.save; finishCross(); }
    };
    w.onerror = () => { actions.endOtherFuture(); };
    w.postMessage({ type: 'init', seed });
  };
  let lastOther = 0;
  const crossSaves: { mine: unknown; theirs: unknown } = { mine: null, theirs: null };
  // crossing over: each simulation takes the other's world, so the planet on screen becomes the other future
  actions.crossOver = () => {
    if (!altWorker || !state.other) return;
    crossSaves.mine = null; crossSaves.theirs = null;
    send({ type: 'save', name: 'cross', slot: 'cross' });
    altWorker.postMessage({ type: 'save', name: 'cross', slot: 'cross' });
  };
  const finishCross = () => {
    if (!crossSaves.mine || !crossSaves.theirs || !altWorker || !state.other) return;
    send({ type: 'load', save: crossSaves.theirs });
    altWorker.postMessage({ type: 'load', save: crossSaves.mine });
    update({ other: { ...state.other, events: [], stats: null }, notice: 'You have crossed into the other future.' });
    window.setTimeout(() => update({ notice: '' }), 4000);
    crossSaves.mine = null; crossSaves.theirs = null;
  };
  actions.endOtherFuture = () => { altWorker?.terminate(); altWorker = null; update({ other: null }); };
  // a small invented family for an individual, stable for as long as it is on screen
  actions.familyOf = (key) => {
    const r = new RNG((key * 40503) >>> 0);
    const mother = placeName(r), father = placeName(r);
    return [`mother ${mother}, father ${father}`, `grandmothers ${placeName(r)} and ${placeName(r)}`, `${1 + r.int(5)} siblings, ${r.int(4)} young`];
  };
  // a family tree that holds together: herd-mates share parents, and the young seen following an animal are its own
  actions.familyTree = (key) => {
    const inds = scene.creatures?.individuals ?? [];
    const me = inds.find((x) => x.key === key);
    if (!me) return null;
    const info = state.species.get(me.species);
    const nameOf = (k: number) => { const ind = inds.find((x) => x.key === k); return ind && info ? describeIndividual(ind, info).name : placeName(new RNG((k * 40503) >>> 0)); };
    const root = me.parent ?? me;
    // one family per herd: the herd number seeds the names of the elders
    const herd = ((root.key / 16) | 0) * 977 + root.species;
    const r = new RNG((herd * 2654435761) >>> 0);
    const mother = placeName(r), father = placeName(r);
    const grand: [string, string, string, string] = [placeName(r), placeName(r), placeName(r), placeName(r)];
    if (me.parent) {
      // a young one: its parent is the animal it follows; its siblings are the other young behind the same parent
      const sibs = inds.filter((x) => x.parent === me.parent && x.key !== key).map((x) => ({ name: nameOf(x.key), key: x.key }));
      return { self: nameOf(key), parents: [nameOf(me.parent.key), placeName(new RNG((me.parent.key * 7919) >>> 0))], grandparents: [mother, father, grand[0], grand[1]], siblings: sibs, young: [] };
    }
    const sibs = inds.filter((x) => !x.parent && x.key !== key && x.species === me.species && (((x.key / 16) | 0) * 977 + x.species) === herd).slice(0, 5).map((x) => ({ name: nameOf(x.key), key: x.key }));
    const young = inds.filter((x) => x.parent === me).map((x) => ({ name: nameOf(x.key), key: x.key }));
    return { self: nameOf(key), parents: [mother, father], grandparents: grand, siblings: sibs, young };
  };
  actions.selectCreatureKey = (key) => {
    const ind = scene.creatures?.byKey(key);
    const info = ind ? state.species.get(ind.species) : undefined;
    if (!ind || !info) return;
    update({ creature: { key: ind.key, species: ind.species, ...describeIndividual(ind, info), following: false }, selectedSpecies: -1, whyEvent: -1 });
    scene.follow(null);
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
  // far enough for any world to get there if it ever will; the worker stops at the age asked for
  actions.skipTo = (to) => send(typeof to === 'string' ? { type: 'warp', years: 1.5e9, untilMark: to, through: true } : to < 0 ? { type: 'warp', stop: true } : { type: 'warp', years: 1.5e9, untilEra: to });
  update({ colorblind: store.get('genesis:cb') === '1', earthNotes: store.get('genesis:earth') === '1' });
  actions.setEarthNotes = (on) => { update({ earthNotes: on }); store.set('genesis:earth', on ? '1' : '0'); };

  // flat map: an equirectangular picture of the planet as it is painted right now
  let mapCells: Int32Array | null = null;
  // ---- their map of the world (system E29): what one country knows of the world, and how wrongly it draws it
  let believed: { key: string; known: Float32Array; share: number; shift: number } | null = null;
  const drawBelievedOn = (cv: HTMLCanvasElement, realm: (typeof state.realms)[number]): void => {
    const colors = scene.planet?.cellColors, ctx = cv.getContext('2d'), chart = realm.charting;
    if (!colors || !ctx || !chart) return;
    const W = cv.width, H = cv.height;
    const cells = lookupFor(W, H);
    const elev = scene.planet!.elevation, sea = state.stats?.seaLevel ?? 0, pos = grid.pos;
    const capital = state.settlements.find((t) => t.id === realm.capital);
    // their own country is in the middle of their map
    const shift = capital ? grid.lon[capital.cell]! : 0;
    const mine = state.settlements.filter((t) => t.ruined < 0 && t.nation === realm.id).slice(0, 160);
    const touch = new Set(realm.contacts ?? []);
    const theirs = state.settlements.filter((t) => t.ruined < 0 && t.nation !== undefined && touch.has(t.nation)).slice(0, 160);
    const ports = mine.filter((t) => { for (let j = 0; j < grid.ncount[t.cell]!; j++) if (elev[grid.neighbors[t.cell * 6 + j]!]! <= sea) return true; return false; });
    // what they know of each place: worked out on a coarser grid, and only when their towns or their knowledge change
    const w = W >> 1, h = H >> 1;
    const key = `${realm.id}|${mine.length}|${theirs.length}|${ports.length}|${chart.reach.toFixed(2)}|${chart.sea.toFixed(2)}|${chart.skill.toFixed(2)}|${w}`;
    if (!believed || believed.key !== key) {
      const known = new Float32Array(w * h);
      const nearest = (list: typeof mine, x: number, y: number, z: number): number => { let best = -2; for (const t of list) { const d = pos[t.cell * 3]! * x + pos[t.cell * 3 + 1]! * y + pos[t.cell * 3 + 2]! * z; if (d > best) best = d; } return best < -1 ? Infinity : Math.acos(Math.min(1, best)); };
      let sum = 0, weight = 0;
      for (let y = 0; y < h; y++) {
        const lat = (0.5 - (y + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < w; x++) {
          const lon = ((x + 0.5) / w) * Math.PI * 2 - Math.PI + shift;
          const px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
          const k = chart.skill >= 1 ? 1 : knownAt(nearest(mine, px, sl, pz), nearest(ports, px, sl, pz), nearest(theirs, px, sl, pz), chart);
          known[y * w + x] = k;
          sum += (k > 0.12 ? 1 : 0) * cl; weight += cl;
        }
      }
      believed = { key, known, share: weight ? sum / weight : 0, shift };
    }
    const known = believed.known;
    const img = ctx.createImageData(W, H);
    const paper = [217, 201, 163], spot: [number, number, number] = [0, 0, 0];
    const wetAt = new Uint8Array(W * H), seen = new Uint8Array(W * H);
    // how they colour what they know: ink and a wash early, the true colours once they can print them
    const wash = Math.min(1, chart.skill * 1.3);
    for (let y = 0; y < H; y++) {
      const lat = (0.5 - (y + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let x = 0; x < W; x++) {
        const i = y * W + x, k = known[Math.min(h - 1, y >> 1) * w + Math.min(w - 1, x >> 1)]!;
        let r = paper[0]!, g = paper[1]!, b = paper[2]!;
        if (k > 0.12) {
          const lon = ((x + 0.5) / W) * Math.PI * 2 - Math.PI + shift;
          believedSpot(cl * Math.cos(lon), sl, cl * Math.sin(lon), k, chart, realm.id * 7919 + 13, spot);
          // (which cell of the true world their map shows here)
          const tl = Math.atan2(spot[2], spot[0]), tb = Math.asin(Math.max(-1, Math.min(1, spot[1])));
          const tx = Math.min(W - 1, Math.max(0, Math.floor(((tl + Math.PI) / (Math.PI * 2)) * W))), ty = Math.min(H - 1, Math.max(0, Math.floor((0.5 - tb / Math.PI) * H)));
          const c = cells[ty * W + tx]!;
          const wet = elev[c]! <= sea;
          wetAt[i] = wet ? 1 : 2; seen[i] = 1;
          const strength = Math.min(1, (k - 0.12) / 0.4);
          const tr = wet ? 150 : Math.pow(Math.min(1, colors[c * 3]!), 0.45) * 255, tg = wet ? 176 : Math.pow(Math.min(1, colors[c * 3 + 1]!), 0.45) * 255, tb2 = wet ? 186 : Math.pow(Math.min(1, colors[c * 3 + 2]!), 0.45) * 255;
          // (an early map is one ochre for land and a pale wash for water)
          const lr = wet ? 176 : 172 + (tr - 172) * wash, lg = wet ? 190 : 150 + (tg - 150) * wash, lb = wet ? 184 : 104 + (tb2 - 104) * wash;
          r += (lr - r) * strength; g += (lg - g) * strength; b += (lb - b) * strength;
        }
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
      }
    }
    // coasts in ink, and the edge of what is known as a dotted line
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      if (seen[i] && ((seen[i + 1] && wetAt[i] !== wetAt[i + 1]) || (seen[i + W] && wetAt[i] !== wetAt[i + W]))) { img.data[i * 4] = 74; img.data[i * 4 + 1] = 52; img.data[i * 4 + 2] = 34; }
      else if ((seen[i] !== seen[i + 1] || seen[i] !== seen[i + W]) && (x + y) % 3 === 0) { img.data[i * 4] = 128; img.data[i * 4 + 1] = 104; img.data[i * 4 + 2] = 78; }
    }
    ctx.putImageData(img, 0, 0);
    const place = (cell: number): [number, number] => { let u = (grid.lon[cell]! - shift + Math.PI) / (Math.PI * 2); u -= Math.floor(u); return [u * W, (0.5 - grid.lat[cell]! / Math.PI) * H]; };
    // towns: their own filled, those they have heard of hollow
    ctx.lineWidth = 1;
    for (const t of theirs) { const [x, y] = place(t.cell); ctx.strokeStyle = '#4a3422'; ctx.strokeRect(x - 1.5, y - 1.5, 3, 3); }
    for (const t of mine) { const [x, y] = place(t.cell); ctx.fillStyle = t.id === realm.capital ? '#8a1c10' : '#4a3422'; ctx.fillRect(x - 1.5, y - 1.5, t.id === realm.capital ? 4 : 3, t.id === realm.capital ? 4 : 3); }
    // the great animals of the sea their sailors have met, drawn where they were met (or as near as the map allows)
    ctx.strokeStyle = '#4a3422'; ctx.fillStyle = '#4a3422'; ctx.font = 'italic 10px Georgia, serif';
    for (const m of realm.monsters ?? []) {
      const [x, y] = place(m.cell);
      const s = 7 + 9 * m.size;
      ctx.beginPath();
      // a long back out of the water in three humps, a head at one end and a fluke at the other
      for (let k = 0; k < 3; k++) ctx.arc(x - s + k * s, y, s * 0.5, Math.PI, 0);
      ctx.moveTo(x + s * 1.5, y); ctx.quadraticCurveTo(x + s * 2.1, y - s * 0.9, x + s * 2.5, y - s * 0.5);
      ctx.moveTo(x - s * 1.5, y); ctx.lineTo(x - s * 2.1, y - s * 0.6); ctx.moveTo(x - s * 1.5, y); ctx.lineTo(x - s * 2.2, y + s * 0.1);
      ctx.stroke();
      ctx.fillText(m.name, Math.min(W - 90, Math.max(4, x - s)), Math.min(H - 4, y + s * 0.9 + 9));
    }
    // the title, in a box in the corner
    ctx.fillStyle = 'rgba(217, 201, 163, 0.88)'; ctx.fillRect(8, 8, 190, 30); ctx.strokeStyle = '#4a3422'; ctx.strokeRect(8.5, 8.5, 190, 30);
    ctx.fillStyle = '#3a2a1c'; ctx.font = '600 12px Georgia, serif'; ctx.fillText(`The world, by ${realm.name}`, 14, 22);
    ctx.font = '10px Georgia, serif'; ctx.fillText(`${Math.round(believed.share * 100)}% of it known to them`, 14, 34);
    update({ mapNote: describeMap(believed.share, chart) });
  };
  const drawMapOn = (cv: HTMLCanvasElement, bare: boolean): void => {
    const mapRealm = !bare && state.mapOf >= 0 ? state.realms.find((r) => r.id === state.mapOf && r.ended < 0 && r.charting) : undefined;
    if (mapRealm) { drawBelievedOn(cv, mapRealm); return; }
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
    if (bare) return;
    // ---- trade routes, coloured by what they carry (system E31): from each country's capital to its buyer's
    if (state.mapOf === -2) {
      ctx.fillStyle = 'rgba(6, 8, 14, 0.45)'; ctx.fillRect(0, 0, W, H);
      const capOf = (id: number) => { const r = state.realms.find((x) => x.id === id); return r ? state.settlements.find((t) => t.id === r.capital) : undefined; };
      ctx.lineCap = 'round';
      const used = new Set<string>();
      for (const r of state.realms) {
        if (r.ended >= 0 || !r.trade) continue;
        const a = capOf(r.id), b = capOf(r.trade.to);
        if (!a || !b) continue;
        used.add(r.trade.good);
        // the short way round the globe, as a curve of a dozen steps (a route that crosses the edge of the map is drawn in two pieces)
        const pa = [grid.pos[a.cell * 3]!, grid.pos[a.cell * 3 + 1]!, grid.pos[a.cell * 3 + 2]!], pb = [grid.pos[b.cell * 3]!, grid.pos[b.cell * 3 + 1]!, grid.pos[b.cell * 3 + 2]!];
        ctx.strokeStyle = GOOD_COLOUR[r.trade.good as keyof typeof GOOD_COLOUR] ?? '#fff'; ctx.lineWidth = 2.2;
        ctx.beginPath();
        let last = -1;
        for (let k = 0; k <= 14; k++) {
          const t = k / 14, x = pa[0]! + (pb[0]! - pa[0]!) * t, y = pa[1]! + (pb[1]! - pa[1]!) * t, z = pa[2]! + (pb[2]! - pa[2]!) * t, l = Math.hypot(x, y, z) || 1;
          const u = ((Math.atan2(z / l, x / l) + Math.PI) / (Math.PI * 2)) * W, v = (0.5 - Math.asin(y / l) / Math.PI) * H;
          if (last < 0 || Math.abs(u - last) > W / 2) ctx.moveTo(u, v); else ctx.lineTo(u, v);
          last = u;
        }
        ctx.stroke();
        // an arrowhead at the buyer's end
        const ux = ((grid.lon[b.cell]! + Math.PI) / (Math.PI * 2)) * W, uy = (0.5 - grid.lat[b.cell]! / Math.PI) * H;
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(ux, uy, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      // the key: one swatch for each good being carried
      let kx = 10;
      ctx.font = '11px system-ui, sans-serif';
      for (const good of used) { ctx.fillStyle = GOOD_COLOUR[good as keyof typeof GOOD_COLOUR] ?? '#fff'; ctx.fillRect(kx, H - 18, 12, 8); ctx.fillStyle = '#ece7db'; ctx.fillText(good, kx + 16, H - 10); kx += 22 + ctx.measureText(good).width + 10; }
      update({ mapNote: used.size ? `${state.realms.filter((r) => r.ended < 0 && r.trade).length} countries have a chief trade. Each line runs from the seller's capital to the buyer's, in the colour of what is carried.` : 'No country is selling anything to another yet.' });
    }
    // ---- a war, battle by battle (system E33): each meeting numbered where it was fought, joined in order
    if (state.mapOf === -3) {
      ctx.fillStyle = 'rgba(6, 8, 14, 0.45)'; ctx.fillRect(0, 0, W, H);
      const war = (state.wars ?? []).find((w) => w.id === state.warShown);
      if (war) {
        const at = war.battles.filter((b) => b.cell >= 0).map((b) => ({ b, x: ((grid.lon[b.cell]! + Math.PI) / (Math.PI * 2)) * W, y: (0.5 - grid.lat[b.cell]! / Math.PI) * H }));
        // (meetings at the same town are fanned out a little so that each number can be read)
        const seen = new Map<number, number>();
        for (const p of at) { const k = seen.get(p.b.cell) ?? 0; seen.set(p.b.cell, k + 1); p.x += k * 9; p.y -= k * 5; }
        ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.beginPath();
        at.forEach((p, i) => { if (i === 0 || Math.abs(p.x - at[i - 1]!.x) > W / 2) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        at.forEach((p, i) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = p.b.winner === 0 ? '#e0563a' : '#4f8fe0'; ctx.fill();
          ctx.strokeStyle = p.b.taken ? '#fff' : '#00000088'; ctx.lineWidth = p.b.taken ? 1.8 : 1; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), p.x, p.y + 0.5);
        });
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    }
    // ---- ideas of how to rule (system E35): a filled disc on every town of a country governed by an idea, a ring
    // (wider as more of its people hold it) where one is gaining ground
    if (state.mapOf === -4) {
      ctx.fillStyle = 'rgba(6, 8, 14, 0.45)'; ctx.fillRect(0, 0, W, H);
      const used = new Set<Idea>();
      let ruled = 0, rising = 0;
      for (const r of state.realms) {
        if (r.ended >= 0 || (!r.idea && !r.creed)) continue;
        if (r.creed) ruled++;
        if (r.idea) rising++;
        for (const st of state.settlements) {
          if (st.nation !== r.id || st.ruined >= 0) continue;
          const x = ((grid.lon[st.cell]! + Math.PI) / (Math.PI * 2)) * W, y = (0.5 - grid.lat[st.cell]! / Math.PI) * H;
          if (r.creed) { used.add(r.creed.kind as Idea); ctx.globalAlpha = 0.6; ctx.fillStyle = IDEA_COLOUR[r.creed.kind as Idea] ?? '#fff'; ctx.beginPath(); ctx.arc(x, y, st.id === r.capital ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
          if (r.idea) { used.add(r.idea.kind as Idea); ctx.strokeStyle = IDEA_COLOUR[r.idea.kind as Idea] ?? '#fff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, 4 + 9 * r.idea.share, 0, Math.PI * 2); ctx.stroke(); }
        }
      }
      let kx = 10;
      ctx.font = '11px system-ui, sans-serif';
      for (const k of used) { ctx.fillStyle = IDEA_COLOUR[k]; ctx.fillRect(kx, H - 18, 12, 8); ctx.fillStyle = '#ece7db'; ctx.fillText(IDEA_LABEL[k], kx + 16, H - 10); kx += 22 + ctx.measureText(IDEA_LABEL[k]).width + 10; }
      update({ mapNote: ruled + rising ? `${ruled} ${ruled === 1 ? 'country is' : 'countries are'} governed by an idea its people rose for (filled). In ${rising} an idea is gaining ground (a ring, wider as more hold it). The colour is what the idea wants: who should rule.` : 'No one has yet had an idea of how a country should be run, other than the way it is.' });
    }
    // ---- a plague, town by town (system E37): the ways trade travels drawn faintly, and over them the way the sickness
    // went, from each town to the next, redder the earlier it was reached
    if (state.mapOf === -6) {
      ctx.fillStyle = 'rgba(6, 8, 14, 0.5)'; ctx.fillRect(0, 0, W, H);
      const at = (cell: number): [number, number] => [((grid.lon[cell]! + Math.PI) / (Math.PI * 2)) * W, (0.5 - grid.lat[cell]! / Math.PI) * H];
      const seg = (a: number, b: number): void => {
        const pa = [grid.pos[a * 3]!, grid.pos[a * 3 + 1]!, grid.pos[a * 3 + 2]!], pb = [grid.pos[b * 3]!, grid.pos[b * 3 + 1]!, grid.pos[b * 3 + 2]!];
        ctx.beginPath();
        let last = -1;
        for (let k = 0; k <= 10; k++) {
          const t = k / 10, x = pa[0]! + (pb[0]! - pa[0]!) * t, y = pa[1]! + (pb[1]! - pa[1]!) * t, z = pa[2]! + (pb[2]! - pa[2]!) * t, l = Math.hypot(x, y, z) || 1;
          const u = ((Math.atan2(z / l, x / l) + Math.PI) / (Math.PI * 2)) * W, v = (0.5 - Math.asin(y / l) / Math.PI) * H;
          if (last < 0 || Math.abs(u - last) > W / 2) ctx.moveTo(u, v); else ctx.lineTo(u, v);
          last = u;
        }
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(236, 231, 219, 0.28)'; ctx.lineWidth = 1;
      for (const w of state.plagueWays) seg(w.a, w.b);
      const plague = (state.plagues ?? []).find((p) => p.id === state.plagueShown);
      if (plague && plague.steps.length) {
        const y0 = plague.began, y1 = Math.max(y0 + 1, ...plague.steps.map((x) => x.year));
        const colour = (year: number): string => { const t = (year - y0) / (y1 - y0); return `rgb(${Math.round(232 - 30 * t)}, ${Math.round(70 + 130 * t)}, ${Math.round(58 + 110 * t)})`; };
        for (const st of plague.steps) {
          if (st.from < 0) continue;
          ctx.strokeStyle = colour(st.year); ctx.lineWidth = st.via === 'foot' ? 1 : 2.2; ctx.setLineDash(st.via === 'foot' ? [2, 3] : []);
          seg(st.from, st.cell);
        }
        ctx.setLineDash([]);
        for (const st of plague.steps) {
          const [x, y] = at(st.cell);
          ctx.fillStyle = colour(st.year); ctx.beginPath(); ctx.arc(x, y, st.from < 0 ? 6 : 2.5 + 6 * st.dead, 0, Math.PI * 2); ctx.fill();
          if (st.shut) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.strokeRect(x - 6, y - 6, 12, 12); }
          if (st.from < 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.stroke(); }
        }
        let kx = 10;
        ctx.font = '11px system-ui, sans-serif';
        for (const [c, label] of [[colour(y0), 'reached first'], [colour(y1), 'reached last'], ['rgba(236, 231, 219, 0.5)', 'a way trade travels']] as const) { ctx.fillStyle = c; ctx.fillRect(kx, H - 18, 12, 8); ctx.fillStyle = '#ece7db'; ctx.fillText(label, kx + 16, H - 10); kx += 22 + ctx.measureText(label).width + 10; }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.strokeRect(kx, H - 19, 10, 10); ctx.fillStyle = '#ece7db'; ctx.fillText('gates shut', kx + 15, H - 10);
      }
    }
    // ---- colonies overseas, and the countries born of them (system E36): a line from the mother country's capital to
    // each colony's chief town, dashed while it is held, red while it is fought over, solid once it is a country
    if (state.mapOf === -5) {
      ctx.fillStyle = 'rgba(6, 8, 14, 0.45)'; ctx.fillRect(0, 0, W, H);
      const townOf = (id: number) => state.settlements.find((t) => t.id === id);
      const capOf = (id: number) => { const r = state.realms.find((x) => x.id === id); return r ? townOf(r.capital) : undefined; };
      const line = (a: number, b: number, colour: string, dash: number[], width: number): void => {
        const pa = [grid.pos[a * 3]!, grid.pos[a * 3 + 1]!, grid.pos[a * 3 + 2]!], pb = [grid.pos[b * 3]!, grid.pos[b * 3 + 1]!, grid.pos[b * 3 + 2]!];
        ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineCap = 'round';
        ctx.beginPath();
        let last = -1;
        for (let k = 0; k <= 14; k++) {
          const t = k / 14, x = pa[0]! + (pb[0]! - pa[0]!) * t, y = pa[1]! + (pb[1]! - pa[1]!) * t, z = pa[2]! + (pb[2]! - pa[2]!) * t, l = Math.hypot(x, y, z) || 1;
          const u = ((Math.atan2(z / l, x / l) + Math.PI) / (Math.PI * 2)) * W, v = (0.5 - Math.asin(y / l) / Math.PI) * H;
          if (last < 0 || Math.abs(u - last) > W / 2) ctx.moveTo(u, v); else ctx.lineTo(u, v);
          last = u;
        }
        ctx.stroke(); ctx.setLineDash([]);
        const ux = ((grid.lon[b]! + Math.PI) / (Math.PI * 2)) * W, uy = (0.5 - grid.lat[b]! / Math.PI) * H;
        ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(ux, uy, 3.6, 0, Math.PI * 2); ctx.fill();
      };
      let held = 0, fighting = 0, free = 0;
      for (const r of state.realms) {
        if (r.ended >= 0) continue;
        const home = townOf(r.capital);
        if (home) for (const c of r.colonies ?? []) { const seat = townOf(c.seat); if (seat) { line(home.cell, seat.cell, '#f0c060', [5, 4], 1.4 + 1.6 * Math.min(1, c.identity)); held++; } }
        if (r.colonyOf && home) {
          const from = capOf(r.colonyOf.mother), alive = state.realms.some((x) => x.id === r.colonyOf!.mother && x.ended < 0);
          if (r.colonyOf.freed < 0) fighting++; else free++;
          if (from && alive) line(from.cell, home.cell, r.colonyOf.freed < 0 ? '#e0563a' : '#62c98a', r.colonyOf.freed < 0 ? [2, 4] : [], 2.2);
          else { const ux = ((grid.lon[home.cell]! + Math.PI) / (Math.PI * 2)) * W, uy = (0.5 - grid.lat[home.cell]! / Math.PI) * H; ctx.fillStyle = '#62c98a'; ctx.beginPath(); ctx.arc(ux, uy, 3.6, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      let kx = 10;
      ctx.font = '11px system-ui, sans-serif';
      for (const [colour, label] of [['#f0c060', 'a colony (thicker as its people grow apart)'], ['#e0563a', 'fighting to be free'], ['#62c98a', 'a country born of a colony']] as const) { ctx.fillStyle = colour; ctx.fillRect(kx, H - 18, 12, 8); ctx.fillStyle = '#ece7db'; ctx.fillText(label, kx + 16, H - 10); kx += 22 + ctx.measureText(label).width + 10; }
      update({ mapNote: held + fighting + free ? `${held} ${held === 1 ? 'colony is' : 'colonies are'} held from across the water. ${fighting ? `${fighting} ${fighting === 1 ? 'is' : 'are'} fighting to be free. ` : ''}${free} living ${free === 1 ? 'country was' : 'countries were'} born of a colony. Each line runs from the mother country's capital.` : 'No country has yet planted a town across an ocean and kept it.' });
    }
    // settlements as warm dots
    ctx.fillStyle = '#ffd27a';
    for (const st of state.settlements) {
      if (st.ruined >= 0) continue;
      const x = ((grid.lon[st.cell]! + Math.PI) / (Math.PI * 2)) * W, y = (0.5 - grid.lat[st.cell]! / Math.PI) * H;
      ctx.fillRect(x - 1, y - 1, st.tech > 0.6 ? 3 : 2, st.tech > 0.6 ? 3 : 2);
    }
  };
  // one byte a cell, as a flat map of any size: a surface by biome (255 is open water), and over it, if given, how
  // different two worlds are there (the butterfly tracker)
  const lookups = new Map<string, Int32Array>();
  const lookupFor = (W: number, H: number): Int32Array => {
    const key = `${W}x${H}`;
    let m = lookups.get(key);
    if (!m) {
      m = new Int32Array(W * H);
      let c = 0;
      for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        for (let x = 0; x < W; x++) { const lon = ((x + 0.5) / W) * Math.PI * 2 - Math.PI; c = nearestCell(grid, Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), c); m[y * W + x] = c; }
      }
      lookups.set(key, m);
    }
    return m;
  };
  const BIOME_RGB = [[12, 44, 92], [18, 62, 120], [44, 112, 150], [214, 200, 150], [236, 240, 245], [150, 150, 130], [62, 96, 72], [62, 122, 62], [142, 162, 82], [152, 142, 92], [214, 186, 130], [182, 172, 92], [32, 102, 52], [72, 112, 92], [132, 132, 132], [84, 62, 60], [222, 232, 242], [230, 226, 212]];
  actions.drawCellBytes = (cv, bytes, over) => {
    const ctx = cv.getContext('2d');
    if (!ctx || bytes.length !== grid.count) return;
    const W = cv.width, H = cv.height, m = lookupFor(W, H);
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const c = m[i]!, b = bytes[c]!;
      let [r, g, bl] = b === 255 ? [20, 58, 112] : (BIOME_RGB[b] ?? [120, 120, 120]) as [number, number, number];
      if (over) {
        // the surface goes grey and dim; the difference glows over it
        const grey = (r + g + bl) / 3 * 0.45, d = over[c]! / 255;
        r = grey + (255 - grey) * d; g = grey + (150 - grey) * d * 0.9; bl = grey + (40 - grey) * d;
      }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = bl; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  // ---- the documentary maker (expansion E59): the plan is made in game/film.ts; here it is shown, and filmed
  let film: { shots: Shot[]; started: number; index: number; speedWas: number; recorder: MediaRecorder | null; board: HTMLCanvasElement | null } | null = null;
  const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const w of text.split(' ')) { const next = line ? `${line} ${w}` : w; if (ctx.measureText(next).width > width && line) { lines.push(line); line = w; } else line = next; }
    if (line) lines.push(line);
    return lines;
  };
  actions.playFilm = (minutes, record) => {
    if (film) return;
    const shots = planFilm(state.events, minutes);
    if (!shots.length) { update({ notice: 'Nothing has happened yet to make a film of.' }); window.setTimeout(() => update({ notice: '' }), 3500); return; }
    film = { shots, started: performance.now(), index: -1, speedWas: state.speedIndex, recorder: null, board: null };
    setSpeed(0);
    if (record) {
      try {
        const board = document.createElement('canvas');
        board.width = 1280; board.height = 720;
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(board.captureStream(30), { mimeType: 'video/webm' });
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => download(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), `genesis-${seed}-documentary.webm`);
        rec.start();
        film.board = board; film.recorder = rec;
      } catch { update({ notice: 'This browser cannot record video here. The film will play without being saved.' }); window.setTimeout(() => update({ notice: '' }), 4000); }
    }
    update({ film: { shots, index: 0, minutes, recording: !!film.recorder }, panel: 'none', whyEvent: -1, selectedSpecies: -1, creature: null });
  };
  actions.stopFilm = () => {
    if (!film) return;
    if (film.recorder && film.recorder.state !== 'inactive') film.recorder.stop();
    setSpeed(film.speedWas);
    film = null;
    scene.cam.idle = 0;
    update({ film: null });
  };
  /** One frame of the film: move to the next shot when its time comes, and paint the frame for the recording. */
  const filmFrame = (now: number): void => {
    if (!film) return;
    const seconds = (now - film.started) / 1000;
    const i = shotAt(film.shots, seconds);
    if (i < 0) { actions.stopFilm(); return; }
    const shot = film.shots[i]!;
    if (i !== film.index) {
      film.index = i;
      const e = state.events[shot.eventId];
      // near for what peoples did in one place, wide for what happened to the land and its life, the whole planet for the rest
      const lon = shot.cell >= 0 ? grid.lon[shot.cell]! : scene.cam.lon + 0.9;
      // (no two shots in a row from the same height: on a GPU the first four were all the whole planet from one distance)
      const wide = [1.0, 0.55, 1.4, 0.75][i % 4]!, whole = [2.3, 1.7, 2.9][i % 3]!;
      if (shot.cell >= 0) scene.cam.flyTo(lon, grid.lat[shot.cell]!, e && e.data && typeof e.data.nation === 'number' ? 0.3 : wide);
      else scene.cam.flyTo(lon, 0.25 * Math.sin(i * 1.7), whole);
      // a film is shot in daylight, with the sun well to one side: straight on, its glare sat in the middle of the picture
      scene.dayAngle = lon - 0.95;
      update({ film: state.film ? { ...state.film, index: i } : null });
    }
    scene.cam.idle = 100;
    const board = film.board;
    if (!board) return;
    const ctx = board.getContext('2d');
    if (!ctx) return;
    const W = board.width, H = board.height;
    // the picture, filling the frame
    const k = Math.max(W / canvas.width, H / canvas.height), w = canvas.width * k, h = canvas.height * k;
    ctx.drawImage(canvas, (W - w) / 2, (H - h) / 2, w, h);
    const shade = ctx.createLinearGradient(0, H * 0.52, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(0.45, 'rgba(0,0,0,0.6)'); shade.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = shade; ctx.fillRect(0, H * 0.52, W, H * 0.48);
    // the words fade in at the start of a shot and out at its end
    const into = seconds - shot.at, left = shot.at + shot.seconds - seconds;
    ctx.globalAlpha = Math.max(0, Math.min(1, into / 0.6, left / 0.3));
    // (a dark edge round the letters: over bright cloud, half faded, they could not be read)
    ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 10;
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff6dc';
    ctx.font = "500 15px ui-monospace, monospace";
    ctx.fillText(formatYear(shot.year).toUpperCase().split('').join('\u200a'), W / 2, H - 196);
    ctx.font = "500 40px 'Cormorant Garamond', serif";
    ctx.fillText(shot.title, W / 2, H - 150);
    ctx.font = "italic 500 23px 'Cormorant Garamond', serif"; ctx.fillStyle = '#ece7db';
    wrap(ctx, shot.text, W * 0.78).slice(0, 4).forEach((line, n) => ctx.fillText(line, W / 2, H - 110 + n * 29));
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  };
  // ---- on the ground (expansion Section 5)
  const underView = (): number => { const hit = scene.pick(innerWidth / 2, innerHeight / 2); return hit ? scene.cellAt(hit.x, hit.y, hit.z) : -1; };
  actions.meet = (town, index) => { update({ panel: 'ground', groundTab: 'citizen', gCitizen: null }); send({ type: 'requestMemory', ask: { what: 'citizen', town, index } }); };
  actions.dropAnchor = (cell) => {
    const c = cell ?? underView();
    if (c < 0) { update({ notice: 'Point the view at the planet first: the anchor drops under the centre of the screen.' }); window.setTimeout(() => update({ notice: '' }), 3500); return; }
    update({ panel: 'ground', groundTab: 'anchor', gAnchor: null });
    send({ type: 'requestMemory', ask: { what: 'anchor', cell: c } });
  };
  actions.eyewitness = (eventId) => { update({ panel: 'ground', groundTab: 'witness', gWitness: null, whyEvent: -1 }); send({ type: 'requestMemory', ask: { what: 'witness', eventId } }); };
  actions.openMuseum = (nation) => { update({ panel: 'ground', groundTab: 'museum', gMuseum: null }); send({ type: 'requestMemory', ask: { what: 'museum', id: nation } }); };
  actions.openBattle = (eventId) => { update({ panel: 'ground', groundTab: 'battle', gBattle: null, whyEvent: -1 }); send({ type: 'requestMemory', ask: { what: 'battle', eventId } }); };
  actions.seeAs = (species) => {
    const sp = state.species.get(species);
    if (!sp) { scene.post.setVision(null); update({ seeingAs: null }); return; }
    const v = vision(sp.genes);
    scene.post.setVision(v);
    update({ seeingAs: { ...v, species } });
  };
  // walking: the keys are read each frame so that held keys move smoothly
  const held = new Set<string>();
  let pad: [number, number] = [0, 0];
  actions.setWalking = (on) => {
    held.clear(); pad = [0, 0];
    if (on) { scene.cam.zoomTo(Math.min(scene.cam.dist, 0.02)); scene.cam.tiltTo(-0.95); if (state.skyView) actions.setSkyView(false); }
    else scene.cam.tiltTo(0);
    update({ walking: on, panel: on ? 'none' : state.panel });
  };
  actions.walkInput = (forward, right) => { pad = [forward, right]; };
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());
  const walkFrame = (dt: number): void => {
    if (!state.walking) return;
    const f = (held.has('w') || held.has('arrowup') ? 1 : 0) - (held.has('s') || held.has('arrowdown') ? 1 : 0) + pad[0];
    const r = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0) + pad[1];
    // a stride that fits the height: you cross what you can see in a second or two, whether on foot or high up
    const stride = scene.cam.dist * 0.75 * Math.min(0.05, dt);
    if (f || r) scene.cam.walk(f * stride, r * stride);
    if (held.has('r')) scene.cam.zoomBy(1 + 1.2 * dt);
    if (held.has('f')) scene.cam.zoomBy(1 - 1.2 * dt);
    scene.cam.idle = 0;
  };
  actions.setSkyView = (on) => {
    if (!on) { scene.cam.sky = 0; scene.cam.tiltTo(0); update({ skyView: false }); return; }
    const c = underView();
    if (c < 0) { update({ notice: 'Point the view at the planet first: you stand under the centre of the screen.' }); window.setTimeout(() => update({ notice: '' }), 3500); return; }
    if (state.walking) actions.setWalking(false);
    const lon = grid.lon[c]!, lat = grid.lat[c]!;
    scene.cam.flyTo(lon, lat, 0.012);
    scene.cam.tiltTo(0.5);
    scene.cam.sky = 2.4;
    // face north, where the pole star would be and where a comet is hung
    scene.cam.faceToward(lon, Math.min(1.5, lat + 0.3));
    // midnight here
    scene.dayAngle = lon + Math.PI;
    scene.cometOver(lon, lat);
    update({ skyView: true, panel: 'none' });
  };
  actions.skyLabels = () => {
    const f = scene.skyFacts(), out: { text: string; x: number; y: number }[] = [];
    const put = (text: string, p: [number, number, number] | null) => { if (!p) return; const [x, y, vis] = scene.projectSky(p[0], p[1], p[2]); if (vis > 0) out.push({ text, x, y }); };
    const phase = f.moonLit > 0.95 ? 'full' : f.moonLit > 0.6 ? 'gibbous' : f.moonLit > 0.4 ? 'half' : f.moonLit > 0.08 ? 'a crescent' : 'new';
    put(`the moon, ${phase} (${Math.round(f.moonLit * 100)}% lit)`, f.moon);
    put('the comet', f.comet);
    // the figures peoples have named among the stars: each hangs where its naming put it, and turns with the sky
    const named = state.events.filter((e) => e && e.type === 'constellation').slice(-6);
    for (const e of named) {
      const a = ((e.id * 0.6180339887) % 1) * Math.PI * 2 - scene.dayAngle, b = (((e.id * 0.7548776662) % 1) - 0.5) * 1.6;
      put(e.title.replace(/^The /, 'the '), [Math.cos(b) * Math.cos(a) * 300, Math.sin(b) * 300, Math.cos(b) * Math.sin(a) * 300]);
    }
    return out;
  };
  actions.whatIf = (eventId) => {
    if (eventId < 0) { send({ type: 'whatif', stop: true }); return; }
    update({ panel: 'archive', memTab: 'whatif', whatIf: null, whatIfMaps: null, whatIfProblem: '', whyEvent: -1 });
    send({ type: 'whatif', eventId });
  };
  actions.whatIfHerd = () => {
    const hit = scene.pick(innerWidth / 2, innerHeight / 2);
    if (!hit) { update({ whatIfProblem: 'Point the view at the planet first: the herd is spared under the centre of the screen.' }); return; }
    update({ whatIf: null, whatIfMaps: null, whatIfProblem: '' });
    send({ type: 'whatif', herdAt: scene.cellAt(hit.x, hit.y, hit.z) });
  };
  actions.drawMap = (cv) => drawMapOn(cv, false);
  actions.drawBareMap = (cv) => drawMapOn(cv, true);
  actions.mapPoint = (cell) => [(grid.lon[cell]! + Math.PI) / (Math.PI * 2), 0.5 - grid.lat[cell]! / Math.PI];
  actions.mapClick = (u, v) => {
    // (on a country's own map its capital is in the middle)
    const turn = state.mapOf >= 0 && believed ? believed.shift : 0;
    scene.cam.flyTo(u * Math.PI * 2 - Math.PI + turn, (0.5 - v) * Math.PI, Math.min(scene.cam.dist, 1.4));
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
  let lastWalk = performance.now();
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
  // a short looping GIF: three seconds at ten frames a second, about 480 pixels wide
  let gifBusy = false;
  actions.saveGif = () => {
    if (gifBusy) return;
    gifBusy = true;
    const w = 480, h = Math.max(2, Math.round((w * canvas.height) / Math.max(1, canvas.width) / 2) * 2);
    const small = document.createElement('canvas');
    small.width = w; small.height = h;
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    const frames: Uint8ClampedArray[] = [];
    update({ notice: 'Recording a three second GIF...' });
    const timer = window.setInterval(() => {
      scene.frame(0);
      ctx.filter = FILTERS[state.photoFilter] ?? 'none';
      ctx.drawImage(canvas, 0, 0, w, h);
      frames.push(ctx.getImageData(0, 0, w, h).data);
      if (frames.length >= 30) {
        window.clearInterval(timer);
        const bytes = encodeGif(frames, w, h, 10);
        download(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/gif' })), `genesis-${seed}.gif`);
        gifBusy = false;
        update({ notice: 'GIF saved.' });
        window.setTimeout(() => update({ notice: '' }), 2500);
      }
    }, 100);
  };
  // the history of the planet as a real PDF: a cover with its portrait, then every great event in order
  actions.exportBook = () => {
    const doc = new PdfDoc();
    const W = doc.width, margin = 62;
    const ink: [number, number, number] = [0.11, 0.1, 0.09], soft: [number, number, number] = [0.42, 0.4, 0.36];
    const paper = () => doc.background(0.965, 0.945, 0.9);
    const jpegOf = (source: HTMLCanvasElement, maxW: number): { data: Uint8Array; w: number; h: number } => {
      const sc = Math.min(1, maxW / source.width);
      const c = document.createElement('canvas');
      c.width = Math.round(source.width * sc); c.height = Math.round(source.height * sc);
      c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
      const b64 = c.toDataURL('image/jpeg', 0.86).split(',')[1]!;
      const bin = atob(b64);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      return { data, w: c.width, h: c.height };
    };
    scene.frame(0);
    const portrait = jpegOf(canvas, 1400);
    const chapters = state.chronicle.map((id) => state.events[id]!).filter((e) => e.importance >= 2);
    const living = [...state.species.values()].filter((x) => x.extinctYear < 0).length;
    // cover
    paper();
    doc.text('GENESIS', W / 2, 150, 44, 'serif', ink, 'centre');
    doc.text(`A history of the world called ${seed}`, W / 2, 182, 15, 'italic', soft, 'centre');
    const iw = W - margin * 2, ih = (iw * portrait.h) / portrait.w;
    doc.jpeg(portrait.data, portrait.w, portrait.h, margin, 220, iw, ih);
    let y = 220 + ih + 34;
    y = doc.paragraph(`From its forming to ${formatYear(state.stats?.simYear ?? 0).toLowerCase()}. ${state.species.size} kinds of animal are named in these pages; ${living} are still alive. ${state.nations.length ? `${state.nations.length} nations light its night side.` : ''}`, margin, y, 13, iw, 'serif', ink);
    doc.paragraph('Every event in this book happened on its own. Nothing was scripted.', margin, y + 8, 12, iw, 'italic', soft);
    // chapters
    doc.addPage(); paper();
    y = 84;
    const bottom = doc.height - 70;
    for (const e of chapters) {
      const big = e.importance >= 3;
      const titleSize = big ? 19 : 14;
      const bodyLines = wrapText(e.description, 11.5, iw).length;
      const need = 14 + titleSize * 1.3 + bodyLines * 11.5 * 1.35 + 20;
      if (y + need > bottom) { doc.text(String(doc.pageCount), W / 2, doc.height - 40, 9, 'sans', soft, 'centre'); doc.addPage(); paper(); y = 84; }
      doc.text(formatYear(e.simYear).toUpperCase(), margin, y, 8, 'sans', soft);
      y += 8 + titleSize;
      doc.text(e.title, margin, y, titleSize, big ? 'bold' : 'serif', ink);
      y += 6 + 11.5;
      y = doc.paragraph(e.description, margin, y, 11.5, iw, 'serif', ink) + 14;
    }
    doc.text(String(doc.pageCount), W / 2, doc.height - 40, 9, 'sans', soft, 'centre');
    // the nations, if any
    if (state.nations.length) {
      doc.addPage(); paper();
      doc.text('The nations', margin, 96, 22, 'serif', ink);
      y = 130;
      for (const n of [...state.nations].sort((p1, p2) => p2.pop - p1.pop).slice(0, 24)) {
        const lin = (v: number) => Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
        doc.rect(margin, y - 9, 16, 11, lin(n.signature[0] * 0.85), lin(n.signature[1] * 0.85), lin(n.signature[2] * 0.85));
        doc.text(n.name, margin + 24, y, 13, 'serif', ink);
        const cap = state.settlements.find((x) => x.id === n.capital);
        doc.text(`${n.members.length} ${n.members.length === 1 ? 'settlement' : 'settlements'}, about ${bigNumber(n.pop * 1000)} people${cap ? `. Capital: ${cap.name}` : ''}`, margin + 24, y + 14, 10, 'italic', soft);
        y += 36;
        if (y > bottom) { doc.addPage(); paper(); y = 84; }
      }
    }
    download(URL.createObjectURL(doc.save()), `genesis-${seed}-history.pdf`);
  };

  // milestone pop-ups play one after another
  const toasts: SimEvent[] = [];
  let toastUntil = 0;
  const pumpToasts = (now: number) => {
    if (state.milestone && now > toastUntil) update({ milestone: null });
    // a title is dropped if the world has since moved a long way past it (the rest are in the chronicle anyway)
    const year = state.stats?.simYear ?? 0, yps = state.stats?.yearsPerSecond ?? 0;
    while (toasts.length && year - toasts[0]!.simYear > Math.max(2e5, yps * 20)) toasts.shift();
    if (!state.milestone && toasts.length && !state.opening) {
      update({ milestone: toasts.shift()! });
      toastUntil = now + (toasts.length ? 3500 : 6000);
    }
  };

  const openedKey = `genesis:opened:${seed}`;
  const finishOpening = () => {
    if (!state.opening) return;
    store.set(openedKey, '1');
    scene.ownsFlash = true;
    update({ opening: false, skipVisible: false });
    setSpeed(4);
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
  let heldNoted = false;
  let bannerTimer = 0;
  const resetHistory = () => {
    state.events = [];
    state.chronicle = [];
    state.hiddenIds = [];
    state.revealed = [];
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
      // a comet the chronicle reports hangs in the sky for a while (E47)
      if (live && (ev.type === 'comet' || ev.type === 'tool-comet')) scene.showComet(90, ev.id);
      // keep effect links current on the events we already hold
      for (const c of ev.causes) {
        const cause = state.events[c];
        if (cause && !cause.effects.includes(ev.id)) cause.effects.push(ev.id);
      }
      if (ev.importance >= 1 && ev.id > 0) state.chronicle.push(ev.id);
      // what was kept secret, and what has since come out (system E39)
      if (ev.hidden) state.hiddenIds.push(ev.id);
      if (ev.type === 'secret-revealed' && ev.data) state.revealed.push(Number(ev.data.secret));
      if (!live) continue;
      if (ev.importance >= 3) toasts.push(ev);
      // a new age somewhere in the world: a banner, for a few seconds
      if (ev.type === 'era' && ev.importance >= 2 && ev.data) {
        const d = ev.data;
        update({ eraBanner: { title: ev.title, nation: String(d.name ?? ''), own: String(d.own ?? ''), earth: String(d.earth ?? ''), year: ev.simYear } });
        window.clearTimeout(bannerTimer);
        bannerTimer = window.setTimeout(() => update({ eraBanner: null }), 9000);
      }
      // documentary director: cut to wherever something notable just happened
      if ((state.director || state.postcard) && ev.importance >= 2 && ev.cellId >= 0 && scene.following === null) actions.flyToCell(ev.cellId, 0.9);
      if ((ev.type === 'war' || ev.type === 'plague') && ev.cellId >= 0) scene.civUnrest(ev.cellId, ev.type);
      // a fallen capital goes dark; a civil war flickers like any other
      if (ev.type === 'nation-collapse' && ev.cellId >= 0) scene.civUnrest(ev.cellId, 'plague');
      if (ev.type === 'civil-war' && ev.cellId >= 0) scene.civUnrest(ev.cellId, 'war');
      if (ev.type === 'hatching' && ev.cellId >= 0) scene.hatchAt(ev.cellId);
      // departure: the light rises from the greatest city
      if (ev.title === 'Departure') { const home = [...state.settlements].filter((x) => x.ruined < 0).sort((p1, p2) => p2.tech - p1.tech)[0]; if (home) scene.launchAt(home.cell); }
      if (ev.type === 'impact') { scene.flash(0.9); scene.impactAt(ev.cellId); }
      else if (ev.type === 'super-eruption') scene.flash(0.35);
      else if (ev.type === 'gamma-burst') scene.flash(0.75);
      else if (ev.type === 'mass-extinction') hushUntil = performance.now() + 45000;
    }
    // After a fast-forward, or at the fastest speeds, hundreds of thousands of years of milestones arrive at once.
    // Shown one after another for seven seconds each they covered the planet for minutes, so only the latest few
    // are announced; the rest are still in the chronicle.
    if (toasts.length > 3) toasts.splice(0, toasts.length - 3);
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
        if (msg.stats.historyHeld && !heldNoted) {
          heldNoted = true;
          update({ notice: 'History has begun. Time now runs at 25 years a second so it can be followed. Pick a faster speed to skip ahead.' });
          window.setTimeout(() => update({ notice: '' }), 9000);
        } else if (!msg.stats.history) heldNoted = false;
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
        music.civEra = msg.stats.topEra ?? 0;
        // the music of whoever's town is in view (system E27): louder the closer the view
        {
          let heard: (typeof state.realms)[number] | undefined, level = 0;
          if (scene.cam.dist < 0.3 && state.settlements.length) {
            scene.cam.focusDir(focusVec);
            let best = 0.9992, town: (typeof state.settlements)[number] | undefined;
            for (const st of state.settlements) {
              if (st.ruined >= 0 || (st.nation ?? -1) < 0) continue;
              const d = grid.pos[st.cell * 3]! * focusVec.x + grid.pos[st.cell * 3 + 1]! * focusVec.y + grid.pos[st.cell * 3 + 2]! * focusVec.z;
              if (d > best) { best = d; town = st; }
            }
            if (town) { heard = state.realms.find((r) => r.id === town!.nation); level = Math.min(1, (0.3 - scene.cam.dist) / 0.22) * Math.min(1, (best - 0.9992) / 0.0005); }
          }
          if (performance.now() > listening) music.setTownMusic(heard && heard.music ? heard.music.tradition : null, heard ? heard.era : 0, level);
        }
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
      case 'cosmos': {
        // a message that has just been sent to the stars is held over the globe for a while (not the ones a loaded world already had)
        const fresh = state.cosmos && msg.messages.length > state.skyMessages.length ? { id: msg.messages.length - 1, until: performance.now() + 60000 } : state.skyMessage;
        scene.setMimics(msg.strange.mimics);
        update({ cosmos: msg.cosmos, strange: msg.strange, future: msg.future, industry: msg.industry, link: msg.link ?? null, skyMessages: msg.messages, archives: msg.archives, skyMessage: fresh && fresh.until > performance.now() ? fresh : null });
        break;
      }
      case 'settlements':
        scene.setSettlements(withPast(msg.settlements), msg.nations);
        // (armies in the field show as camp fires on the night side: system E33)
        scene.civ?.setCamps(msg.armies ?? []);
        update({ settlements: msg.settlements, realms: msg.nations ?? state.realms });
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
      case 'site':
        update({ siteDetail: msg.detail });
        break;
      case 'whatif':
        update({ whatIf: msg.state, whatIfMaps: msg.maps ?? (msg.state ? state.whatIfMaps : null), whatIfProblem: msg.problem ?? '' });
        break;
      case 'memory': {
        const a = msg.answer;
        if (a.what === 'index') update({ memIndex: a.data });
        else if (a.what === 'article') update({ memArticle: a.data });
        else if (a.what === 'atlas') update({ memAtlas: a.data });
        else if (a.what === 'braid') update({ memBraid: a.data });
        else if (a.what === 'records') update({ memRecords: a.data });
        else if (a.what === 'ancestry') update({ memAncestry: a.data });
        else if (a.what === 'forecasts') update({ memForecasts: a.data });
        else if (a.what === 'citizen') update({ gCitizen: a.data });
        else if (a.what === 'anchor') update({ gAnchor: a.data });
        else if (a.what === 'museum') update({ gMuseum: { asked: a.asked, data: a.data } });
        else if (a.what === 'battle') update({ gBattle: a.data });
        else if (a.what === 'witness') {
          update({ gWitness: a.data });
          // stand where they stood, low, and turn to face it
          if (a.data) {
            const w = a.data;
            scene.cam.flyTo(grid.lon[w.cell]!, grid.lat[w.cell]!, 0.014);
            scene.cam.faceToward(grid.lon[w.target]!, grid.lat[w.target]!, w.cell === w.target ? -0.5 : -1.0);
            scene.cam.idle = 0;
          }
        } else if (a.what === 'place' && state.chrono && a.data && a.data.id === state.chrono.id) { update({ memPlace: a.data }); scene.setSettlements(withPast(state.settlements), state.realms); }
        break;
      }
      case 'diplomacy':
        update({ diplomacy: msg.web });
        break;
      case 'plagues':
        update({ plagues: msg.list, plagueWays: msg.ways, plagueShown: msg.list.some((p) => p.id === state.plagueShown) ? state.plagueShown : msg.list[0]?.id ?? -1 });
        break;
      case 'wars':
        update({ wars: msg.list, warShown: msg.list.some((w) => w.id === state.warShown) ? state.warShown : msg.list[0]?.id ?? -1 });
        break;
      case 'market':
        update({ market: msg.market });
        break;
      case 'legends':
        update({ legends: msg.list });
        break;
      case 'gallery':
        update({ gallery: { paintings: msg.paintings, movements: msg.movements } });
        break;
      case 'languages': {
        const want = pendingTongue ? msg.list.find((l) => l.name === pendingTongue) : undefined;
        pendingTongue = '';
        update(want ? { languages: { lexicon: msg.lexicon, sayings: msg.sayings, list: msg.list }, tongue: want.id } : { languages: { lexicon: msg.lexicon, sayings: msg.sayings, list: msg.list } });
        break;
      }
      case 'dynasty':
        update({ dynastyDetail: msg.detail });
        break;
      case 'nation':
        update({ nationDetail: msg.detail });
        break;
      case 'layer':
        if (state.overlay === msg.kind) scene.setLayerOverlay(msg.values, msg.kind === 'oxygen' ? [0.25, 0.85, 1.0] : [0.2, 1.0, 0.55]);
        break;
      case 'saved': {
        if (msg.slot === 'fork') { startOtherFuture(msg.save); break; }
        if (msg.slot === 'cross') { crossSaves.mine = msg.save; finishCross(); break; }
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
    send({ type: 'init', seed, neighbor: params.get('neighbor') || undefined });
    // each rewind point is a whole copy of the world: keep fewer where memory is short
    send({ type: 'rewindLimit', count: mobile ? 5 : 12 });
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
  let lastLayer = 0;
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
    if (!state.tool) {
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
    if (state.tool && !state.handsOff) {
      const hit = scene.pick(x, y);
      if (hit) {
        const genes = state.tool === 'species' ? Array.from({ length: GENE_COUNT }, (_, i) => state.design[i] ?? 0.3) : undefined;
        send({ type: 'tool', tool: state.tool, cell: scene.cellAt(hit.x, hit.y, hit.z), power: 0.8, genes });
        update({ tool: '', panel: 'none' });
      }
    }
  };
  scene.cam.onLongPress = () => update({ panel: 'tools' });

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
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    // while walking, the movement keys are movement keys and nothing else
    if (state.walking) {
      if (k === 'escape') { actions.setWalking(false); return; }
      if (['w', 'a', 's', 'd', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { held.add(k); e.preventDefault(); return; }
    }
    if (state.skyView && k === 'escape') { actions.setSkyView(false); return; }
    if (e.code === 'Space') { e.preventDefault(); actions.togglePause(); }
    else if (e.key >= '1' && e.key <= '7') setSpeed(Number(e.key) - 1);
    else if (k === 'h') update({ uiHidden: !state.uiHidden });
    else if (k === 'c') togglePanel('chronicle');
    else if (k === 't') togglePanel('tree');
    else if (k === 'g') togglePanel('tools');
    else if (k === 'j') togglePanel('goals');
    else if (k === 's') togglePanel('system');
    else if (k === 'n') togglePanel('microscope');
    else if (k === 'a') togglePanel('archive');
    else if (k === 'b') togglePanel('ground');
    else if (e.key === '?' || k === '/') togglePanel('help');
    else if (k === 'p') { update({ postcard: !state.postcard }); scene.cam.idle = state.postcard ? 100 : 0; }
    else if (k === 'm') togglePanel('map');
    else if (k === 'x') togglePanel('section');
    else if (k === 'u') { scene.underwater = !scene.underwater; update({ notice: scene.underwater ? 'Diving allowed: zoom in over the sea to go under.' : '' }); window.setTimeout(() => update({ notice: '' }), 2500); }
    else if (k === 'v') scene.firstPerson = !scene.firstPerson;
    else if (k === 'd' && e.shiftKey) {
      // a black-box report of everything the picture is drawn from, for bug reports
      const report = { ...scene.diagnose(), seed, url: location.search, stats: state.stats, quality: state.quality, overlay: state.overlay, speed: state.speedIndex };
      download(URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' })), `genesis-${seed}-diagnostic.json`);
    }
    else if (k === 'o') { const order = ['none', 'temp', 'rain', 'life', 'people', 'fossils', 'nations', 'fungal', 'diversity', 'oxygen'] as const; actions.setOverlay(order[(order.indexOf(state.overlay) + 1) % order.length]!); }
    else if (k === 'f') { if (state.creature) actions.followCreature(!state.creature.following); }
    else if (k === 'escape' && scene.following !== null) actions.followCreature(false);
    else if (k === 'escape') { if (state.postcard) update({ postcard: false }); else closeAll(); }
  });
  window.addEventListener('resize', () => scene.resize());

  let lastFocus = 0;
  let slowFor = 0, fastFor = 0, steppedUpAt = 0, retryAfter = 0, retryWait = 300000, quietUntil = Infinity;
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
        const snd = scene.soundscape();
        music.ambience(Math.min(1, scene.cam.dist) * 0.5 + 0.1, Math.max(snd.surf, wet ? near : near * 0.2), Math.max(snd.rain, Math.min(1, rain) * near));
        music.place(snd.surfPan, snd.rainPan, snd.lava, snd.lavaPan);
        // the living overlays follow the world as it changes
        if ((state.overlay === 'diversity' || state.overlay === 'oxygen') && now - lastLayer > 4000) { lastLayer = now; send({ type: 'requestLayer', kind: state.overlay }); }
        if (rain > 0.2 && near > 0.2 && Math.random() < 0.12) music.thunder();
      }
      // adaptive quality: two seconds under target takes the next step down (the order is in applyQuality)
      // With room to spare for a good while it tries one step back up; if that fails it waits much longer before
      // trying again, so a machine on the edge is not made to stutter every few minutes.
      const target = mobile ? 26 : 50;
      // (`&noadapt` in the address keeps the preset as chosen: software rendering in checks is always "too slow")
      // Loading is not the picture: while the erosion bake runs and the first shaders compile, frames are slow for
      // reasons that have nothing to do with the preset. Counting them stepped Ultra down before it had drawn a
      // single normal frame, and then remembered that. The watch starts a few seconds after the bake is done.
      if (!scene.erosion?.finished) quietUntil = now + 5000;
      const watching = !state.opening && !params.has('noadapt') && document.visibilityState === 'visible' && now > quietUntil;
      if (watching && scene.fpsAvg < target) {
        slowFor += dt; fastFor = 0;
        if (slowFor > 2 && adaptive < 5) {
          adaptive++; slowFor = 0; applyQuality(); rememberSteps();
          if (steppedUpAt > 0 && now - steppedUpAt < 20000) { retryWait = Math.min(retryWait * 4, 3600000); retryAfter = now + retryWait; }
        }
      } else {
        slowFor = 0;
        if (watching && adaptive > 0 && scene.fpsAvg > target * 1.14 && now > retryAfter) {
          fastFor += dt;
          if (fastFor > 15) { adaptive--; fastFor = 0; steppedUpAt = now; retryAfter = now + 20000; applyQuality(); rememberSteps(); }
        } else fastFor = 0;
      }
      scene.cam.autoOrbit = state.reducedMotion ? 0 : state.postcard ? 0.035 : 0.012;
      // postcard mode: a slow cinematic drift in and out, with depth of field up close
      scene.cinematic = state.postcard;
      if (state.postcard && !state.reducedMotion && scene.following === null) {
        if (postcardBase === 0) postcardBase = scene.cam.dist;
        scene.cam.zoomTo(postcardBase * (1 + 0.28 * Math.sin(now / 9000)));
        scene.cam.idle = 100;
      } else postcardBase = 0;
      const busy = state.panel !== 'none' || state.whyEvent >= 0 || state.selectedSpecies >= 0 || !!state.film;
      if (!state.uiHidden && !state.opening && !busy && now - lastActivity > 4000) update({ uiHidden: true });
    }
    filmFrame(now);
    walkFrame(Math.min(0.1, (now - lastWalk) / 1000));
    if (state.seeingAs) scene.post.setReach(scene.cam.dist);
    lastWalk = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // hooks for automated visual checks
  // grab the 3D canvas straight after a render (cheap way to capture frames in automated checks)
  const grab = () => { scene.frame(0); return canvas.toDataURL('image/jpeg', 0.9); };
  (window as unknown as { __genesis: unknown }).__genesis = { scene, state, setSpeed, update, actions, send, grab, music, diagnose: () => scene.diagnose(), skip: () => opening?.skip(), opening: () => opening };
}

boot().catch((err) => {
  console.error(err);
  fatal('Something went wrong while starting Genesis. Reloading the page usually fixes it.');
});
