export function formatYear(y: number): string {
  if (y < 10) return `Year ${y.toFixed(2)}`;
  if (y < 10_000) return `Year ${Math.floor(y).toLocaleString('en-US')}`;
  if (y < 1e6) return `Year ${(y / 1000).toFixed(1)} thousand`;
  if (y < 1e9) return `Year ${(y / 1e6).toFixed(2)} million`;
  return `Year ${(y / 1e9).toFixed(3)} billion`;
}

export function shortYear(y: number): string {
  if (y < 10_000) return `${Math.floor(y)} y`;
  if (y < 1e6) return `${(y / 1000).toFixed(0)} ky`;
  return `${(y / 1e6).toFixed(2)} My`;
}

export function bigNumber(n: number): string {
  if (n < 1000) return n.toFixed(0);
  if (n < 1e6) return `${(n / 1e3).toFixed(1)} thousand`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} million`;
  if (n < 1e12) return `${(n / 1e9).toFixed(1)} billion`;
  return `${(n / 1e12).toFixed(1)} trillion`;
}

export function metres(m: number): string {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`;
}

/** Colour for an event type, used for chronicle dots and cause-chain thumbnails. */
export function eventColor(type: string): string {
  switch (type) {
    case 'eruption': case 'super-eruption': case 'volcanic-winter': return '#ff7a3c';
    case 'impact': case 'impact-winter': return '#ffd27a';
    case 'ice-age': case 'ice-age-end': case 'sea-fall': return '#9fd4ff';
    case 'greenhouse': case 'greenhouse-end': case 'sea-rise': return '#ffb26b';
    case 'extinction': case 'mass-extinction': case 'plant-extinct': return '#c9c2d6';
    case 'speciation': case 'radiation': return '#8fe3a0';
    case 'plant-species': return '#b7e07a';
    case 'wildfire': return '#ff9d4d';
    case 'milestone': return '#fff1c9';
    case 'oxygen': return '#a8e6ff';
    case 'settlement': case 'belief': case 'prophet': case 'contact': return '#ffcf8a';
    case 'ruin': return '#b9a48c';
    case 'storm': return '#b5c4de';
    case 'earthquake': case 'tsunami': return '#c7b299';
    case 'plague': return '#b7d08a';
    case 'eclipse': case 'comet': return '#d9c8ff';
    case 'painting': case 'tamed': case 'temple': return '#ffcf8a';
    case 'living-fossil': case 'convergence': return '#8fe3a0';
    case 'orbital-shift': return '#d9c8ff';
    default: return type.startsWith('god-') ? '#fff1c9' : '#e9e4d8';
  }
}

/** A one-glyph thumbnail for an event type. */
export function eventGlyph(type: string): string {
  switch (type) {
    case 'eruption': case 'super-eruption': return '▲';
    case 'volcanic-winter': case 'impact-winter': return '☁';
    case 'impact': return '✦';
    case 'ice-age': return '❄';
    case 'ice-age-end': case 'greenhouse': case 'greenhouse-end': return '☀';
    case 'sea-fall': case 'sea-rise': return '≈';
    case 'extinction': case 'plant-extinct': return '†';
    case 'mass-extinction': return '‡';
    case 'speciation': case 'radiation': return '⑂';
    case 'plant-species': return '❦';
    case 'wildfire': return '♨';
    case 'milestone': return '★';
    case 'oxygen': return '○';
    case 'settlement': return '⌂';
    case 'belief': case 'prophet': return '☼';
    case 'contact': return '⇄';
    case 'ruin': return '∴';
    case 'storm': return '☇';
    case 'earthquake': return '≋';
    case 'tsunami': return '≈';
    case 'plague': return '✚';
    case 'eclipse': return '◐';
    case 'comet': return '☄';
    case 'painting': return '✎';
    case 'tamed': return '∞';
    case 'temple': return '△';
    case 'living-fossil': return '◈';
    case 'convergence': return '≍';
    case 'orbital-shift': return '◔';
    default: return type.startsWith('god-') ? '✦' : '•';
  }
}

export function hsl(h: number, s = 70, l = 62): string {
  return `hsl(${Math.round(h * 360)} ${s}% ${l}%)`;
}
