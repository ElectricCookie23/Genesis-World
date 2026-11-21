// The gallery as the page is told of it (system E26): the paintings worth showing and the schools of painters.
import type { MovementInfo, PaintingInfo } from '../../shared/protocol';
import type { SimEvent } from '../events';
import { ART_STYLES, describePainting } from './art';
import type { HistoryState } from './model';
import type { Body } from './script';

/**
 * The first painting of each age in each country, and the latest of all, newest first; and every movement any
 * of them belongs to or that is still followed.
 */
export function galleryList(h: HistoryState, events: SimEvent[], towns: { name: string }[], bodyOf: (species: number) => Body, limit = 72): { paintings: PaintingInfo[]; movements: MovementInfo[] } {
  const all = h.paintings ?? [], ms = h.movements ?? [];
  const firsts = all.filter((p) => p.first), rest = all.filter((p) => !p.first);
  // (the earliest painting of every age is always hung, whatever else there is room for)
  const earliest = new Map<number, (typeof all)[number]>();
  for (const p of all) if (!earliest.has(p.era)) earliest.set(p.era, p);
  const pinned = new Set([...earliest.values()].map((p) => p.id));
  const room = Math.max(0, limit - pinned.size);
  const shown = [...earliest.values(), ...firsts.filter((p) => !pinned.has(p.id)).slice(-Math.floor(room / 2)), ...rest.filter((p) => !pinned.has(p.id)).slice(-Math.ceil(room / 2))].sort((a, b) => b.year - a.year);
  const followed = new Map<number, string[]>();
  for (const n of h.nations) if (n.ended < 0 && n.movement !== undefined) { let l = followed.get(n.movement); if (!l) followed.set(n.movement, (l = [])); l.push(n.name); }
  const paintings: PaintingInfo[] = shown.map((p) => {
    const n = h.nations[p.nation], m = p.movement >= 0 ? ms[p.movement] : undefined;
    return {
      id: p.id, year: p.year, nation: n ? n.name : 'a camp before there were countries', town: towns[p.settlement]?.name ?? '', eventId: p.eventId, eventTitle: events[p.eventId]?.title ?? '', subject: p.subject, era: p.era, style: p.style,
      styleName: ART_STYLES[p.style] ?? '', movement: p.movement, movementName: m ? m.name : '', turn: m ? m.turn : 0, loud: m ? m.loud : 0.5, title: p.title, painter: p.painter, seed: p.seed, hueA: p.hueA, hueB: p.hueB, night: p.night, detail: p.detail,
      first: !!p.first, caption: describePainting(p), body: bodyOf(p.species),
    };
  });
  const keep = new Set<number>([...followed.keys(), ...shown.map((p) => p.movement).filter((x) => x >= 0)]);
  for (const id of [...keep]) for (let m = ms[id]; m && m.against >= 0 && keep.size < 60; m = ms[m.against]) keep.add(m.against);
  const movements: MovementInfo[] = ms.filter((m) => keep.has(m.id)).map((m) => ({
    id: m.id, name: m.name, own: m.own, style: m.style, styleName: ART_STYLES[m.style] ?? '', turn: m.turn, loud: m.loud, born: m.born, nation: h.nations[m.nation]?.name ?? '', against: m.against, againstName: m.against >= 0 ? ms[m.against]?.name ?? '' : '',
    eventId: m.eventId, followers: followed.get(m.id) ?? [],
  }));
  return { paintings, movements };
}
