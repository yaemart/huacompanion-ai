export function filterGuides<T extends { category?: number }>(
  items: T[],
  category: number,
) {
  return items.filter((item) => !category || item.category === category);
}
