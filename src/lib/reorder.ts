/**
 * Where a dragged row belongs, for a list whose rows are not all the same
 * height (PRD F6, §3.4).
 *
 * Lives here rather than beside the component because it is the part that can
 * be wrong quietly. The animation is visible the moment it misbehaves; this
 * is arithmetic that produces a plausible answer either way, and the only way
 * to know it is right is to ask it directly.
 */

/** Top of slot `index`, in list space. */
export function offsetOf(
  ids: string[],
  heights: Record<string, number>,
  index: number
): number {
  'worklet';
  let y = 0;
  for (let i = 0; i < index; i++) y += heights[ids[i]] ?? 0;
  return y;
}

/**
 * Which slot a row belongs in, given where its top edge has been dragged to.
 *
 * `rest` is the order with the dragged row taken out, so its cumulative
 * heights are the places the row could be put back: slot 0 is above
 * everything, slot 1 is after the first remaining row, and so on. The answer
 * is whichever of those the row's top is nearest.
 *
 * Measured against the neighbours' own heights rather than a fixed step,
 * which is what lets rows of different heights sit in one list: a tall stop
 * carrying two warnings has to be passed further than a bare one before it
 * gives up its place.
 *
 * It used to compare the row's *centre* against the same accumulations, and
 * that was wrong in a way that only showed on a list of uneven rows. At zero
 * movement the centre sits half the dragged row's height below its own
 * insertion point, so the row was judged to belong one slot later unless it
 * happened to be shorter than the row beneath it — dragging down took a
 * nudge, and dragging up took a whole row's height of travel before anything
 * moved. Measured this way, resting exactly on an insertion point is a
 * distance of zero, so a row that has not moved cannot be anywhere but where
 * it is, and the two directions cost the same.
 */
export function slotAt(
  rest: string[],
  heights: Record<string, number>,
  top: number
): number {
  'worklet';
  let acc = 0;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i <= rest.length; i++) {
    const distance = Math.abs(top - acc);
    // Strictly nearer, so a tie keeps the earlier slot. Ties happen when a
    // row is dragged exactly halfway across a neighbour, and settling them
    // consistently is what stops the gap flickering between two places while
    // a finger holds still on the boundary.
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
    if (i < rest.length) acc += heights[rest[i]] ?? 0;
  }
  return best;
}
