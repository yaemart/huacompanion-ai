export type TodayItem = {
  id: string;
  title: string;
  action: string;
  href: string;
  createdAt: string;
  dueAt?: string;
};

export function chinaDay(now: number) {
  const day = 24 * 60 * 60 * 1000;
  const offset = 8 * 60 * 60 * 1000;
  const start = Math.floor((now + offset) / day) * day;
  const date = new Date(start).toISOString().slice(0, 10);
  return { date, end: new Date(start + day - offset).toISOString() };
}

export function sortToday(items: TodayItem[]) {
  const deadline = (item: TodayItem) => (item.dueAt ? Date.parse(item.dueAt) : Infinity);
  return [...items].sort(
    (a, b) => deadline(a) - deadline(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}
