import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

const STAR = 28;
const GAP = 6;
const ROW_W = STAR * 5 + GAP * 4;
const FILLED = '#E8A22F';

/**
 * Optional 1–5 rating, collapsed to a single star until asked for.
 *
 * Stamping is meant to cost one tap, and five stars sitting open on the
 * screen read as a question you owe an answer to. Collapsed, it is an offer;
 * expanded, it is a control. Would-go-again remains the signal the planner
 * consumes — this is colour the user can add for themselves.
 *
 * Once open, a single gesture sets the value: press anywhere on the row and
 * drag across the stars, which is faster than aiming for one target and lets
 * you change your mind without lifting. Dragging back off the left edge
 * clears it, so the control can be undone the same way it was set.
 */
export function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(value != null);

  // Mirrors `value` on the UI thread so the pan worklet can avoid firing a
  // state update on every frame — only when the star under the finger changes.
  const current = useSharedValue(value ?? 0);
  const open = useSharedValue(expanded ? 1 : 0);

  const commit = (next: number) => onChange(next === 0 ? null : next);

  const pan = Gesture.Pan()
    // Fires on touch-down, so a plain tap sets a value without a drag.
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      const next = starAt(e.x);
      if (next !== current.value) {
        current.value = next;
        runOnJS(commit)(next);
      }
    })
    .onUpdate((e) => {
      'worklet';
      const next = starAt(e.x);
      if (next !== current.value) {
        current.value = next;
        runOnJS(commit)(next);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [{ scale: 0.92 + 0.08 * open.value }],
  }));

  const expand = () => {
    setExpanded(true);
    open.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
  };

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.iconTile}
        onPress={expanded ? undefined : expand}
        hitSlop={6}
      >
        <MaterialCommunityIcons
          name={value != null ? 'star' : 'star-outline'}
          size={18}
          color={value != null ? FILLED : colors.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.stars, rowStyle]}>
            {[1, 2, 3, 4, 5].map((n) => (
              <MaterialCommunityIcons
                key={n}
                name={value != null && n <= value ? 'star' : 'star-outline'}
                size={STAR}
                color={value != null && n <= value ? FILLED : colors.borderStrong}
              />
            ))}
          </Animated.View>
        </GestureDetector>
      ) : (
        <Pressable style={styles.label} onPress={expand}>
          <Text style={styles.labelText}>Rate this visit</Text>
        </Pressable>
      )}

      <Text style={styles.optional}>optional</Text>
    </View>
  );
}

/**
 * Which star sits under an x offset within the row. Left of the first star
 * means zero, which is how a rating gets cleared.
 */
function starAt(x: number): number {
  'worklet';
  if (x < 0) return 0;
  const n = Math.ceil(x / (STAR + GAP));
  return n < 1 ? 1 : n > 5 ? 5 : n;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, justifyContent: 'center', height: 36 },
  labelText: { fontSize: 13, color: colors.textPrimary },
  stars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    width: ROW_W,
    height: 36,
  },
  optional: { fontSize: 11, color: colors.textMuted },
});
