export function formatYear(y: number): string {
  if (y < 10) return `Year ${y.toFixed(2)}`;
  if (y < 10_000) return `Year ${Math.floor(y).toLocaleString('en-US')}`;
  if (y < 1e6) return `Year ${(y / 1000).toFixed(1)} thousand`;
  if (y < 1e9) return `Year ${(y / 1e6).toFixed(2)} million`;
  return `Year ${(y / 1e9).toFixed(3)} billion`;
}
