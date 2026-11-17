import type { ApiLandlord } from "./directory-types";
const normalize = (value: string) => value.toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9 ]/g, " ").trim();
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
export function similarLandlords(query: string, landlords: ApiLandlord[]) {
  const term = normalize(query);
  if (term.length < 3 || term.length > 80) return [];
  return landlords.map(item => ({ item, score: Math.min(...normalize(item.name).split(" ").filter(word => word.length >= 3).map(word => distance(term, word)), distance(term, normalize(item.name))) }))
    .filter(({ score }) => score <= (term.length > 6 ? 2 : 1)).sort((a, b) => a.score - b.score).slice(0, 3).map(({ item }) => item);
}
