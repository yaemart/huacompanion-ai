/** Late call creation/claims must be released instead of reaching an abandoned UI. */
export async function settleCallAction<T>(
  pending: Promise<T>,
  isCurrent: () => boolean,
  release: (value: T) => Promise<void>,
): Promise<T | null> {
  const value = await pending;
  if (isCurrent()) return value;
  await release(value);
  return null;
}
/** The acquiring attempt owns a late stream, never another attempt's current stream. */
export async function acquireCallMedia<T extends { getTracks: () => { stop: () => void }[] }>(
  getMedia: () => Promise<T>,
  isCurrent: () => boolean,
): Promise<T | null> {
  const media = await getMedia();
  if (isCurrent()) return media;
  media.getTracks().forEach((track) => track.stop());
  return null;
}
