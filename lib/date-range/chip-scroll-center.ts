export function computeChipCenterScrollLeft({
  chipOffsetLeft,
  chipOffsetWidth,
  scrollerClientWidth,
  scrollerScrollWidth,
}: {
  chipOffsetLeft: number;
  chipOffsetWidth: number;
  scrollerClientWidth: number;
  scrollerScrollWidth: number;
}): number {
  const target =
    chipOffsetLeft - (scrollerClientWidth - chipOffsetWidth) / 2;
  const maxScroll = Math.max(0, scrollerScrollWidth - scrollerClientWidth);
  return Math.min(maxScroll, Math.max(0, target));
}
