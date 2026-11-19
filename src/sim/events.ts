// Event log and cause graph. Every significant event records what caused it.

export type EventId = number;

export interface SimEvent {
  id: EventId;
  type: string;
  simYear: number;
  cellId: number;
  title: string;
  description: string;
  causes: EventId[];
  /** Relative weight of each cause (same order as causes), 0..1. */
  causeWeights: number[];
  effects: EventId[];
  speciesIds?: number[];
  /** Importance 0..3. 2+ slows time, 3 is a milestone pop-up. */
  importance: number;
  data?: Record<string, number | string>;
}

export interface NewEvent {
  type: string;
  cellId?: number;
  title: string;
  description: string;
  causes?: EventId[];
  causeWeights?: number[];
  speciesIds?: number[];
  importance?: number;
  data?: Record<string, number | string>;
  /** The year it happened, when that is not the simulation's current year. */
  year?: number;
}

export class EventLog {
  events: SimEvent[] = [];
  /** Events added since the last drain (for posting to the main thread). */
  private fresh: SimEvent[] = [];
  /** Most recent event of each type, for quick cause lookup. */
  private lastByType = new Map<string, EventId>();

  add(simYear: number, e: NewEvent): SimEvent {
    const id = this.events.length;
    const causes = (e.causes ?? []).filter((c, i, a) => c >= 0 && c < id && a.indexOf(c) === i);
    const weights = causes.map((_, i) => e.causeWeights?.[i] ?? 1);
    const ev: SimEvent = {
      id,
      type: e.type,
      simYear: e.year ?? simYear,
      cellId: e.cellId ?? -1,
      title: e.title,
      description: e.description,
      causes,
      causeWeights: weights,
      effects: [],
      speciesIds: e.speciesIds,
      importance: e.importance ?? 1,
      data: e.data,
    };
    this.events.push(ev);
    for (const c of causes) this.events[c]!.effects.push(id);
    this.fresh.push(ev);
    this.lastByType.set(e.type, id);
    return ev;
  }

  get(id: EventId): SimEvent | undefined {
    return this.events[id];
  }

  last(type: string): SimEvent | undefined {
    const id = this.lastByType.get(type);
    return id === undefined ? undefined : this.events[id];
  }

  /** Most recent event of a type, if it happened within maxAge years. */
  recent(type: string, simYear: number, maxAge: number): SimEvent | undefined {
    const e = this.last(type);
    return e && simYear - e.simYear <= maxAge ? e : undefined;
  }

  drainFresh(): SimEvent[] {
    const f = this.fresh;
    this.fresh = [];
    return f;
  }

  /** Walk the graph backward from an event: breadth-first, nearest causes first. */
  chain(id: EventId, maxSteps = 24): SimEvent[] {
    const out: SimEvent[] = [];
    const seen = new Set<EventId>();
    let frontier = [id];
    while (frontier.length && out.length < maxSteps) {
      const next: EventId[] = [];
      for (const f of frontier) {
        if (seen.has(f)) continue;
        seen.add(f);
        const e = this.events[f];
        if (!e) continue;
        out.push(e);
        for (const c of e.causes) next.push(c);
      }
      frontier = next;
    }
    return out;
  }
}
