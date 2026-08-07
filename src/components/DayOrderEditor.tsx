import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { categoryIcon } from './icons';
import type { CuratedPlace } from '../domain/types';
import { categoryColors, colors, tint } from '../theme/colors';

/**
 * Arranging the day by hand (PRD F6, §3.4).
 *
 * Modelled on rearranging apps on iOS, which resolves the problem that made
 * dragging inside the plan sheet awkward in the first place. The timeline
 * lives in a bottom sheet inside a horizontal pager, so a drag would be the
 * third gesture recogniser competing for the same finger. An explicit edit
 * mode makes them exclusive instead: while this is on screen the caller locks
 * the pager and the sheet, so there is only ever one thing listening.
 *
 * Edit mode also earns the right to change what a row looks like, and that is
 * what makes the drag arithmetic honest. Timeline rows vary in height — some
 * carry warnings, some do not — and hit-testing a drag against variable rows
 * is where hand-rolled reordering usually goes wrong. These rows are uniform,
 * so the target index is the drag distance divided by one number.
 */

/** Uniform row height. The whole drag calculation rests on this. */
const ROW_H = 56;

const JIGGLE_DEG = 1.1;

export function DayOrderEditor({
  places,
  onReorder,
  onDone,
  onOptimise,
}: {
  places: CuratedPlace[];
  onReorder: (ids: string[]) => void;
  onDone: () => void;
  onOptimise: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Arrange the day</Text>
        {/*
          §3.4: the optimiser becomes an on-demand assist rather than
          all-or-nothing, and this is how it is asked back. It lives in the
          header rather than under the list because the list is as long as the
          day — below eight stops a footer control is off-screen, and the way
          out of a hand-arranged day must not depend on how long the day is.
        */}
        <View style={styles.headActions}>
          <Pressable
            onPress={onOptimise}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Let the planner order the day again"
            style={styles.optimise}
          >
            <MaterialCommunityIcons name="auto-fix" size={14} color={colors.accent} />
            <Text style={styles.optimiseText}>Auto</Text>
          </Pressable>
          <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.hint}>
        Hold a stop until it lifts, then move it. The times and transport are
        worked out around the order you set.
      </Text>

      <View style={{ height: places.length * ROW_H }}>
        {places.map((place, i) => (
          <Row
            key={place.id}
            place={place}
            index={i}
            count={places.length}
            onMove={(from, to) => {
              const next = places.map((p) => p.id);
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              onReorder(next);
            }}
          />
        ))}
      </View>

    </View>
  );
}

function Row({
  place,
  index,
  count,
  onMove,
}: {
  place: CuratedPlace;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  const tilt = useSharedValue(0);
  const [dragging, setDragging] = useState(false);

  /**
   * The wobble. Rows are offset by their index so the list does not pulse in
   * unison, which reads as an animation rather than as a set of loose things.
   */
  useEffect(() => {
    tilt.value = withSequence(
      withTiming(0, { duration: (index % 4) * 45 }),
      withRepeat(
        withSequence(
          withTiming(JIGGLE_DEG, { duration: 120, easing: Easing.linear }),
          withTiming(-JIGGLE_DEG, { duration: 120, easing: Easing.linear })
        ),
        -1,
        true
      )
    );
    return () => cancelAnimation(tilt);
  }, [index, tilt]);

  /**
   * Half a second, matching the press that starts rearranging on iOS.
   *
   * It began at 140ms, which is not a long press — it is a pause. An ordinary
   * scroll flick was picked up as a drag and silently reordered the day,
   * which also meant the list could not be scrolled at all. The threshold has
   * to be long enough that the scroll gesture wins by default.
   */
  const drag = Gesture.Pan()
    .activateAfterLongPress(500)
    .onStart(() => {
      lifted.value = withTiming(1, { duration: 120 });
      runOnJS(setDragging)(true);
    })
    .onUpdate((e) => {
      y.value = e.translationY;
    })
    .onEnd(() => {
      const steps = Math.round(y.value / ROW_H);
      const target = Math.min(count - 1, Math.max(0, index + steps));
      lifted.value = withTiming(0, { duration: 120 });
      if (target !== index) {
        // Snap home first; the list re-renders in the new order underneath.
        y.value = 0;
        runOnJS(onMove)(index, target);
      } else {
        y.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
      runOnJS(setDragging)(false);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { rotate: `${dragging ? 0 : tilt.value}deg` },
      { scale: 1 + lifted.value * 0.03 },
    ],
    zIndex: dragging ? 10 : 1,
    shadowOpacity: lifted.value * 0.18,
  }));

  const primary = place.themes[0];

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={[styles.row, { top: index * ROW_H }, style]}
        accessibilityLabel={`${place.name}, stop ${index + 1} of ${count}. Hold and move to reorder.`}
      >
        <View style={[styles.icon, { backgroundColor: tint(categoryColors[primary]) }]}>
          <MaterialCommunityIcons
            name={categoryIcon[primary]}
            size={15}
            color={categoryColors[primary]}
          />
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.meta}>
            {place.district} · {place.visitDurationMin} min
          </Text>
        </View>
        <MaterialCommunityIcons name="drag-horizontal-variant" size={20} color={colors.textMuted} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 6, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  done: { fontSize: 15, fontWeight: '500', color: colors.accent },
  hint: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_H - 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 1 },
  name: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  meta: { fontSize: 11, color: colors.textSecondary },
  optimise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: colors.surfaceAlt,
  },
  optimiseText: { fontSize: 12, fontWeight: '500', color: colors.accent },
});
