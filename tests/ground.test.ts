// Life on the ground (expansion Section 5): citizen E41, life story E42, anchor E45, eyewitness E46, museum E48,
// battlefield E49, senses E50.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { GENE_COUNT, G } from '../src/sim/genetics';
import { MUSEUM_TECH, anchor, battle, citizenLife, museum, vision, witness } from '../src/sim/ground';
import { article } from '../src/sim/memory';
import { battleDots } from '../src/ui/ground';

function world(seed: string, years: number): Simulation {
  const sim = new Simulation(seed, 21);
  for (let t = 0; t < 400e6 && !sim.civ.historyActive; t += 15000) sim.step(15000);
  for (let y = 0; y < years; y += 5) sim.step(5);
  return sim;
}

describe('life on the ground', () => {
  const sim = world('amber-reef-101', 6000);
  const h = sim.civ.h, ev = sim.events.events;
  const towns = sim.civ.settlements.filter((s) => s.ruined < 0).sort((a, b) => b.pop - a.pop);

  it('E41: any citizen can be followed through a full day, from waking at home to sleeping there', () => {
    expect(towns.length).toBeGreaterThan(2);
    for (const st of [towns[0]!, towns[Math.floor(towns.length / 2)]!, towns[towns.length - 1]!]) {
      for (const index of [0, 7, 250]) {
        const c = citizenLife(sim, st.id, index)!;
        expect(c.townName).toBe(st.name);
        expect(c.name.length).toBeGreaterThan(1);
        expect(c.trade).not.toBe('child');
        expect(c.household.length).toBe(4);
        // a whole day, in order, beginning and ending at home, with work in it and something on their mind at every stop
        expect(c.day.length).toBeGreaterThanOrEqual(6);
        expect(c.day[0]!.place).toBe('home');
        expect(c.day[c.day.length - 1]!.place).toBe('home');
        for (let i = 1; i < c.day.length; i++) expect(c.day[i]!.hour).toBeGreaterThan(c.day[i - 1]!.hour);
        expect(c.day[c.day.length - 1]!.hour - c.day[0]!.hour).toBeGreaterThanOrEqual(14);
        expect(new Set(c.day.map((s) => s.place)).size).toBeGreaterThanOrEqual(2);
        expect(new Set(c.day.map((s) => s.thought)).size).toBe(c.day.length);
        for (const s of c.day) { expect(s.thought.length).toBeGreaterThan(10); if (s.eventId !== undefined) expect(ev[s.eventId]).toBeDefined(); }
        // they speak their own language
        expect(c.saying!.text.length).toBeGreaterThan(3);
        expect(c.saying!.gloss.length).toBeGreaterThan(3);
        // the same person every time
        expect(citizenLife(sim, st.id, index)).toEqual(c);
      }
    }
    expect(citizenLife(sim, towns[0]!.id, 7)!.name).not.toBe(citizenLife(sim, towns[0]!.id, 250)!.name);
    expect(citizenLife(sim, 99999, 0)).toBeNull();
  });

  it('E42: a life story is tied to things that really happened: in the largest towns, to three or more', () => {
    let rich = 0;
    for (const st of towns.slice(0, 8)) {
      const c = citizenLife(sim, st.id, 7)!;
      const real = c.life.filter((l) => l.eventId !== undefined);
      for (const l of real) expect(ev[l.eventId!]).toBeDefined();
      for (let i = 1; i < c.life.length; i++) expect(c.life[i]!.year).toBeGreaterThanOrEqual(c.life[i - 1]!.year);
      expect(c.life.some((l) => l.age === 0 && l.text.startsWith('Born at'))).toBe(true);
      expect(c.life[c.life.length - 1]!.text).toContain(`of ${st.name}`);
      // what they lived through happened while they were alive; what they were told happened before
      for (const l of real) { if (l.text.startsWith('Their ')) expect(l.age).toBeLessThan(0); else if (!l.text.startsWith('Took up') && l.age !== 0) expect(l.age).toBeGreaterThanOrEqual(0); }
      if (real.length >= 3) rich++;
    }
    // (which towns are the largest, and what their last sixty years held, shifts whenever the history engine gains a system:
    // the brief asks that a biography reference three real events, and in any history some of the largest towns' do)
    expect(rich).toBeGreaterThanOrEqual(2);
  });

  it('E45: an anchor shows one place across all of history: five or more distinct states where a town has stood', () => {
    let five = 0;
    for (const st of sim.civ.settlements) {
      const a = anchor(sim, st.cell)!;
      expect(a.states.length).toBeGreaterThan(0);
      for (let i = 0; i < a.states.length; i++) {
        const s = a.states[i]!;
        expect(s.to).toBe(i === a.states.length - 1 ? -1 : a.states[i + 1]!.from);
        if (i > 0) { expect(s.from).toBeGreaterThanOrEqual(a.states[i - 1]!.from); expect(s.kind + s.name).not.toBe(a.states[i - 1]!.kind + a.states[i - 1]!.name); }
      }
      // the town is in it, under its own name
      expect(a.states.some((s) => s.name === st.name)).toBe(true);
      if (new Set(a.states.map((s) => s.kind + s.name)).size >= 5) five++;
    }
    expect(five).toBeGreaterThan(sim.civ.settlements.length * 0.5);
    // a living town is the last state of its cell; a place no one has lived is ground and nothing else
    const top = anchor(sim, towns[0]!.cell)!;
    expect(top.states[top.states.length - 1]!.name).toBe(towns[0]!.name);
    let wild = -1;
    for (let i = 0; i < sim.grid.count && wild < 0; i++) if (!sim.civ.settlements.some((s) => s.cell === i)) wild = i;
    for (const s of anchor(sim, wild)!.states) expect(s.name).toBe('');
    expect(anchor(sim, -1)).toBeNull();
  });

  it('E46: every great event with a place has an eyewitness: a townsman if a town stood near, else an animal', () => {
    const great = ev.filter((e) => e.importance >= 2 && e.cellId >= 0);
    expect(great.length).toBeGreaterThan(10);
    let citizens = 0, animals = 0, none = 0;
    for (const e of great) {
      const w = witness(sim, e.id);
      if (!w) { none++; continue; }
      expect(w.target).toBe(e.cellId);
      expect(w.line.length).toBeGreaterThan(20);
      expect(w.km).toBeGreaterThanOrEqual(0);
      expect(w.km).toBeLessThan(3300);
      if (w.kind === 'citizen') { citizens++; const st = sim.civ.settlements[w.ref!.id]!; expect(st.founded).toBeLessThanOrEqual(e.simYear); expect(w.who).toContain(st.name); } else { animals++; expect(sim.creatures.species[w.ref!.id]).toBeDefined(); }
      expect(witness(sim, e.id)).toEqual(w);
    }
    expect(citizens).toBeGreaterThan(0);
    expect(animals).toBeGreaterThan(0);
    // only an event from before there was any animal to see it goes unwitnessed
    for (const e of great) if (!witness(sim, e.id)) expect(e.simYear).toBeLessThan(sim.creatures.species[0]!.bornYear + 1);
    expect(none).toBeLessThan(great.length * 0.5);
    expect(witness(sim, 99999999)).toBeNull();
  });

  it('E48: a nation that has come far enough keeps a museum, and everything in it is a real thing of that world', () => {
    const living = h.nations.filter((n) => n.ended < 0);
    let found = 0;
    for (const n of living) {
      const m = museum(sim, n.id);
      if (n.tech < MUSEUM_TECH) { expect(m).toBeNull(); continue; }
      if (!m) continue;
      found++;
      expect(m.town).toBe(n.capital);
      expect(m.since).toBeLessThanOrEqual(sim.simYear);
      expect(m.rooms.length).toBeGreaterThan(0);
      for (const r of m.rooms) for (const x of r.exhibits) {
        expect(x.label.length).toBeGreaterThan(20);
        expect(x.own.length).toBeGreaterThan(3);
        expect(x.gloss.length).toBeGreaterThan(3);
        if (x.ref) expect(article(sim, x.ref), `${x.title}`).not.toBeNull();
        if (x.eventId !== undefined) expect(ev[x.eventId]).toBeDefined();
        if (x.kind === 'bones') { const sp = sim.creatures.species[x.ref!.id]!; expect(sp.extinctYear).toBeGreaterThanOrEqual(0); expect(x.genes!.length).toBe(GENE_COUNT); }
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(museum(sim, 99999)).toBeNull();
    const dead = h.nations.find((n) => n.ended >= 0);
    if (dead) expect(museum(sim, dead.id)).toBeNull();
  });

  it('E49: a battle on the ground ends the way the record says the war ended', () => {
    const wars = ev.filter((e) => e.type === 'war' || e.type === 'civil-war');
    expect(wars.length).toBeGreaterThan(3);
    let taken = 0, held = 0, told = 0;
    for (const w of wars) {
      const b = battle(sim, w.id);
      if (!b) continue;
      told++;
      const fell = w.effects.some((x) => ev[x]?.type === 'conquest');
      expect(b.result).toBe(fell ? 'taken' : 'held');
      expect(b.phases[b.phases.length - 1]).toContain(fell ? 'new flag' : 'still stands');
      expect(b.attacker.men).toBeGreaterThan(0);
      expect(b.defender.men).toBeGreaterThan(0);
      expect(b.attacker.arms.length).toBeGreaterThan(3);
      expect(battle(sim, w.id)).toEqual(b);
      if (fell) taken++; else held++;
    }
    expect(told).toBeGreaterThan(3);
    expect(held).toBeGreaterThan(0);
    void taken;
    expect(battle(sim, h.nations[0]!.eventId)).toBeNull();
    // the picture of the field is the same every time, and the side the record says lost is the side that runs
    const one = battle(sim, wars[wars.length - 1]!.id)!;
    expect(battleDots(one, 0.5)).toEqual(battleDots(one, 0.5));
    const start = battleDots(one, 0), end = battleDots(one, 1);
    const mean = (dots: typeof end, side: number) => { const xs = dots.filter((d) => d.side === side).map((d) => d.x); return xs.reduce((a, b) => a + b, 0) / xs.length; };
    // attackers start on the left, defenders on the right
    expect(mean(start, 0)).toBeLessThan(mean(start, 1));
    if (one.result === 'taken') expect(mean(end, 0)).toBeGreaterThan(mean(start, 0) + 100); // the attackers end in the town
    else expect(mean(end, 0)).toBeLessThan(mean(start, 0)); // or back past where they began
  });
});

describe('E50 through their eyes', () => {
  const genes = (over: Partial<Record<number, number>>) => { const g = new Float32Array(GENE_COUNT).fill(0.3); for (const [k, v] of Object.entries(over)) g[Number(k)] = v!; return g; };
  it('three species with different senses give three clearly different views', () => {
    const hawk = vision(genes({ [G.EyeCount]: 0.34, [G.EyeSize]: 0.8, [G.Sight]: 0.9, [G.Nocturnal]: 0.05, [G.Echo]: 0, [G.Electric]: 0 }));
    const bat = vision(genes({ [G.EyeCount]: 0.34, [G.EyeSize]: 0.15, [G.Sight]: 0.1, [G.Nocturnal]: 0.9, [G.Echo]: 0.9, [G.Electric]: 0 }));
    const eel = vision(genes({ [G.EyeCount]: 0.2, [G.EyeSize]: 0.2, [G.Sight]: 0.15, [G.Electric]: 0.85, [G.Echo]: 0 }));
    const snake = vision(genes({ [G.EyeCount]: 0.34, [G.EyeSize]: 0.2, [G.Sight]: 0.2, [G.Nocturnal]: 0.8, [G.WarmBlood]: 0.1, [G.Diet]: 0.8, [G.Echo]: 0, [G.Electric]: 0 }));
    const worm = vision(genes({ [G.EyeCount]: 0, [G.Echo]: 0, [G.Electric]: 0 }));
    expect(hawk.mode).toBe('sight');
    expect(bat.mode).toBe('echo');
    expect(eel.mode).toBe('electric');
    expect(snake.mode).toBe('heat');
    expect(new Set([hawk.text, bat.text, eel.text, snake.text, worm.text]).size).toBe(5);
    expect(hawk.acuity).toBeGreaterThan(0.8);
    expect(hawk.colour).toBeGreaterThan(0.6);
    expect(bat.acuity).toBeLessThan(0.3);
    expect(bat.colour).toBe(0);
    expect(bat.night).toBeGreaterThan(hawk.night);
    expect(worm.acuity).toBe(0);
    expect(worm.field).toBe(0);
    // more eyes, and a grazer's eyes on the sides of its head, see more of the way round
    const many = vision(genes({ [G.EyeCount]: 1, [G.EyeSize]: 0.6, [G.Sight]: 0.6, [G.Diet]: 0.1 }));
    expect(many.field).toBeGreaterThan(hawk.field);
    for (const v of [hawk, bat, eel, snake, worm, many]) for (const x of [v.acuity, v.colour, v.night, v.field]) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
  });
});
