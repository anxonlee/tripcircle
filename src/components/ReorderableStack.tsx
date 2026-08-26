import React, { useLayoutEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, pressedWell } from '../theme/colors';

/**
 * Reordering a list without moving it (PRD F6, §3.4).
 *
 * Modelled on a music queue: every row wears a grip, all the time, and a
 * finger on that grip moves the row at once. There is no mode to enter, so
 * there is nothing to announce and nothing to leave — which is why the rows
 * do not wobble. A wobble is a mode telling you it is on; a list that shakes
 * with no mode behind it is just a list that shakes.
 *
 * An earlier version swapped the plan's timeline for a tidy list of uniform
 * rows, because uniform rows make the drag arithmetic trivial — the target
 * slot is the drag distance over one number. It was the wrong trade. The
 * timeline collapsed upward, by 7pt at the first stop and more at every stop
 * after it, and a day that rearranges itself the moment you ask to rearrange
 * it has already lost the thread.
 *
 * So this takes whatever rows it is given, at whatever heights they happen to
 * be, and moves nothing until a finger does. Every position is derived, never
 * assigned:
 *
 * - `committedIds` is the order React laid out, so a row's natural top is the
 *   heights of everything before it in that order.
 * - `liveIds` is the order the finger has arrived at, updated mid-drag.
 * - a row's offset is the difference between the two.
 *
 * At rest the orders match and every offset is zero, which is the whole
 * point: the list can carry grips permanently without ever being displaced by
 * them. And `committedIds` is set in a layout effect, so it changes in the
 * same commit as the layout it describes — the two can never disagree by a
 * frame, which is how the old version earned its jump on release.
 */

/** Top of slot `index`, in list space. */
function offsetOf(
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
 * Which slot a row dropped at `centre` belongs in.
 *
 * Measured against the other rows' own middles rather than a fixed step,
 * which is what lets rows of different heights sit in one list: a tall stop
 * carrying two warnings has to be passed further than a bare one before it
 * gives up its place, and that is exactly what the eye expects.
 */
function slotAt(
  rest: string[],
  heights: Record<string, number>,
  centre: number
): number {
  'worklet';
  let acc = 0;
  for (let i = 0; i < rest.length; i++) {
    const h = heights[rest[i]] ?? 0;
    if (centre < acc + h / 2) return i;
    acc += h;
  }
  return rest.length;
}

export function ReorderableStack({
  ids,
  onReorder,
  onPickUp,
  scrollRef,
  pagerRef,
  renderItem,
}: {
  /** The committed order. Rendering follows it exactly. */
  ids: string[];
  onReorder: (ids: string[]) => void;
  /**
   * Called the moment a row is picked up.
   *
   * The grips are silent by design — no wobble, no mode, nothing on screen
   * that says a drag is available. A tap on lift is what confirms the grip
   * was hit, and without it a finger that misses by a few points and a finger
   * that landed look identical until the row does or does not follow.
   */
  onPickUp?: () => void;
  /**
   * The scrollable this sits inside. The handles' drag is declared to block
   * it, or a vertical pan starting on a handle is taken as a scroll and the
   * row never moves.
   */
  scrollRef: React.RefObject<any>;
  /**
   * The horizontal pager the list is a page of, if it is inside one.
   *
   * The grips are permanent now, so a drag no longer happens with the pager
   * stood down — the two share the screen and can be handed the same finger.
   * Blocking it settles which one gets it once the drag has started; the
   * `activeOffsetY` below settles the sideways case, where the finger lands
   * on a grip but means to turn the page.
   */
  pagerRef?: React.RefObject<any>;
  /**
   * The row. It is handed the drag so the grip can be placed inside its own
   * layout rather than floated over it — floated, the grip landed on the
   * arrival time. Put it in the box some other control already occupies and
   * the row keeps its exact height, which is the rule this component lives by.
   */
  renderItem: (id: string, drag: PanGesture) => React.ReactNode;
}) {
  const liveIds = useSharedValue(ids);
  const committedIds = useSharedValue(ids);
  const heights = useSharedValue<Record<string, number>>({});
  const activeId = useSharedValue('');
  /** Where the dragged row started, in list space. Its offset is read from here. */
  const activeTop = useSharedValue(0);
  const activeShift = useSharedValue(0);

  const idKey = ids.join(',');
  useLayoutEffect(() => {
    committedIds.value = ids;
    // Never while a finger is down: the live order is ahead of this one on
    // purpose, and that difference is what holds the gap open.
    if (activeId.value === '') liveIds.value = ids;
    // Keyed on the joined string, not the array: a fresh array of the same
    // ids is the common case and must not restate the order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  return (
    <View>
      {ids.map((id) => (
        <Item
          key={id}
          id={id}
          liveIds={liveIds}
          committedIds={committedIds}
          heights={heights}
          activeId={activeId}
          activeTop={activeTop}
          activeShift={activeShift}
          scrollRef={scrollRef}
          pagerRef={pagerRef}
          onCommit={onReorder}
          onPickUp={onPickUp}
        >
          {renderItem}
        </Item>
      ))}
    </View>
  );
}

function Item({
  id,
  liveIds,
  committedIds,
  heights,
  activeId,
  activeTop,
  activeShift,
  scrollRef,
  pagerRef,
  onCommit,
  onPickUp,
  children,
}: {
  id: string;
  liveIds: SharedValue<string[]>;
  committedIds: SharedValue<string[]>;
  heights: SharedValue<Record<string, number>>;
  activeId: SharedValue<string>;
  activeTop: SharedValue<number>;
  activeShift: SharedValue<number>;
  scrollRef: React.RefObject<any>;
  pagerRef?: React.RefObject<any>;
  onCommit: (ids: string[]) => void;
  onPickUp?: () => void;
  children: (id: string, drag: PanGesture) => React.ReactNode;
}) {
  /**
   * Whether a finger is on this row's grip. Raised on `onBegin` rather than
   * `onStart`, so the row answers the touch itself rather than waiting for
   * the pan to be recognised — the wait is short, but it is the difference
   * between a grip that responds and one that seems not to have been hit.
   */
  const held = useSharedValue(0);

  /**
   * Record this row's height for the drag arithmetic.
   *
   * Through `modify` rather than by assigning `.value`. A shared value holding
   * an object does not take a plain assignment from the JS thread — measured,
   * every row reported its height and the map read back empty, which made the
   * drag think every row was zero tall and sent whatever was dragged to the
   * end of the list.
   */
  const measure = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    heights.modify((v) => {
      'worklet';
      v[id] = h;
      return v;
    });
  };

  const drag = Gesture.Pan()
    .blocksExternalGesture(...([scrollRef, pagerRef].filter(Boolean) as React.RefObject<any>[]))
    /*
     * Vertical intent before this takes the finger. A grip sitting on a page
     * of a horizontal pager is a grip people will swipe across, and a drag
     * that claimed those would make the objectives unreachable from any row.
     * Six points is under a deliberate pull and over a thumb's wobble.
     */
    .activeOffsetY([-6, 6])
    .onBegin(() => {
      held.value = withTiming(1, { duration: 90 });
    })
    .onFinalize(() => {
      held.value = withTiming(0, { duration: 160 });
    })
    /*
     * A thumb's worth of room around the grip, but not to the left: the row's
     * own controls stand there now that the grip no longer takes their box,
     * and slop reaching over them would swallow taps meant for directions.
     * Outwards, towards the screen edge, there is nothing to take from.
     */
    .hitSlop({ left: 2, right: 16, top: 14, bottom: 14 })
    .onStart(() => {
      if (onPickUp) runOnJS(onPickUp)();
      activeId.value = id;
      activeTop.value = offsetOf(
        liveIds.value,
        heights.value,
        liveIds.value.indexOf(id)
      );
      activeShift.value = 0;
    })
    /**
     * The reorder happens here, under the finger, not on release. Splicing
     * the live order as the drag passes each row is what opens the gap ahead
     * and closes it behind, and it leaves release with nothing to decide.
     */
    .onUpdate((e) => {
      activeShift.value = e.translationY;
      const centre =
        activeTop.value + e.translationY + (heights.value[id] ?? 0) / 2;
      const rest = liveIds.value.filter((x) => x !== id);
      const target = slotAt(rest, heights.value, centre);
      if (liveIds.value.indexOf(id) !== target) {
        const next = rest.slice();
        next.splice(target, 0, id);
        liveIds.value = next;
      }
    })
    /**
     * Settle into the gap the list has already made, then hand the order
     * over. Dropping `activeId` swaps the row onto the live-order formula,
     * which by construction reads the same number it is already sitting at,
     * so the swap moves nothing. The re-render that follows moves nothing
     * either: it changes the natural top and `committedIds` together.
     */
    .onEnd(() => {
      const settled = offsetOf(
        liveIds.value,
        heights.value,
        liveIds.value.indexOf(id)
      );
      activeShift.value = withTiming(
        settled - activeTop.value,
        { duration: 170, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (!finished) return;
          activeId.value = '';
          // Nothing moved, so nothing is stored: a handle brushed in passing
          // must not count as arranging the day, because a stored order
          // switches the optimiser off until Auto is pressed.
          if (settled !== activeTop.value) runOnJS(onCommit)(liveIds.value);
        }
      );
    });

  /**
   * Where this row sits in the list, as a number that can be sprung.
   *
   * The spring has to live here rather than in the style, and the reason is
   * worth stating because it cost a release: `withSpring()` returns an
   * animation, not a number. Returning one straight out as a style value is
   * fine; doing arithmetic on it is not — `withSpring(live) - natural`
   * evaluates to NaN, and a row with a NaN transform simply does not draw.
   * Every row the drag had not picked up disappeared for the length of the
   * gesture.
   *
   * Driving a shared value instead keeps the animation whole and leaves the
   * style doing plain arithmetic on plain numbers.
   */
  const y = useSharedValue(0);
  useAnimatedReaction(
    () => offsetOf(liveIds.value, heights.value, liveIds.value.indexOf(id)),
    (live, previous) => {
      /*
       * Springing only under a finger, and only towards a position that has
       * actually moved. Off a drag the row is already where it belongs, and
       * the only thing changing is the order React laid it out in — which the
       * style cancels on its own, in the same frame, with no animation to lag
       * behind it. That cancellation is what stops a release jumping.
       */
      if (previous === null || activeId.value === '') y.value = live;
      else y.value = withSpring(live, { damping: 22, stiffness: 260, mass: 0.5 });
    }
  );

  const style = useAnimatedStyle(() => {
    const isActive = activeId.value === id;
    const natural = offsetOf(
      committedIds.value,
      heights.value,
      committedIds.value.indexOf(id)
    );
    /*
     * `live` is where the row belongs in the list and does not change when the
     * new order is committed — the drag already put it there. `natural` is
     * where React laid the row out, and it changes at exactly that moment.
     * Subtracting one from the other means the commit moves both by the same
     * amount in the same frame, and they cancel.
     */
    const live = isActive ? activeTop.value + activeShift.value : y.value;

    return {
      transform: [
        // The dragged row follows the finger exactly. Anything else is lag.
        { translateY: live - natural },
        { scale: withTiming(isActive ? 1.02 : 1, { duration: 130 }) },
      ],
      zIndex: isActive ? 20 : 1,
      shadowOpacity: withTiming(isActive ? 0.18 : 0, { duration: 130 }),
    };
  });

  /**
   * The slab that darkens under the finger.
   *
   * A layer of its own rather than a background on the block, because it has
   * to be inset to show its corners and the block cannot be: the block's
   * width is the row's width, and narrowing it would move every stop sideways
   * the moment a grip was touched. Absolutely positioned, so it costs no
   * layout, and drawn before the row so it sits behind it.
   */
  const slab = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      held.value,
      [0, 1],
      ['rgba(0, 0, 0, 0)', pressedWell]
    ),
  }));

  return (
    <Animated.View onLayout={measure} style={[styles.item, style]}>
      <Animated.View pointerEvents="none" style={[styles.slab, slab]} />
      {children(id, drag)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: colors.surface,
    // The block is opaque so a lifted row does not show the rows it passes.
    shadowColor: '#000',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  slab: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 0,
    bottom: 0,
    borderRadius: 14,
  },
});
