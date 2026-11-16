type VisualBounds = { height: number; offsetTop: number; scale: number };

export function staffKeyboardOverlap(
  layoutHeight: number,
  visual: VisualBounds | undefined,
  typing: boolean,
): number {
  if (!typing || !visual || visual.scale !== 1) return 0;
  const overlap = layoutHeight - visual.height - visual.offsetTop;
  // Ignore the small difference caused by browser chrome expanding and collapsing.
  return Number.isFinite(overlap) && overlap >= 80 ? Math.round(overlap) : 0;
}
