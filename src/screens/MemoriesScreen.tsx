import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemoryWallScreen } from './MemoryWallScreen';
import { SummaryScreen } from './SummaryScreen';
import { colors } from '../theme/colors';

type Pane = 'wall' | 'summary';

const PANES: Pane[] = ['wall', 'summary'];

/**
 * Both halves of the switch are the same width, so the sliding pill is
 * exactly half the track and needs no measuring — the track's width is two
 * of these and the pill's travel is one.
 */
const SEGMENT_W = 104;

/**
 * The diary tab: the memory wall and the weekly summary, one above the other
 * rather than a tab apart.
 *
 * They were two bottom tabs, which put four across the bar and read as four
 * unrelated places. They are not unrelated — both are views of the same
 * visits, the wall spatial and the summary temporal — so they share a tab and
 * a switch, and the freed slot goes to settings.
 */
export function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [pane, setPane] = useState<Pane>('wall');

  const pagerRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  /**
   * The pill tracks the finger rather than the outcome, so the switch is a
   * readout of the drag and not a thing that catches up afterwards. Native
   * driver, hence transform only — a width or a colour could not follow a
   * scroll this closely.
   */
  const slide = useMemo(
    () =>
      scrollX.interpolate({
        inputRange: [0, width],
        outputRange: [0, SEGMENT_W],
        extrapolate: 'clamp',
      }),
    [scrollX, width]
  );

  /**
   * The labels flip at the halfway mark rather than on landing: the pill has
   * visibly arrived by then, and a label that waits for the momentum to stop
   * reads as lag. `pane` is also what the tap handler sets, so the two routes
   * agree.
   */
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
          const i = Math.min(
            PANES.length - 1,
            Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width))
          );
          const next = PANES[i];
          setPane((p) => (p === next ? p : next));
        },
      }),
    [scrollX, width]
  );

  /**
   * Tap: move the pager and let the scroll set `pane` on the way past, so a
   * tap and a swipe end in the same state by the same route.
   */
  const select = useCallback(
    (next: Pane) => {
      pagerRef.current?.scrollTo({
        x: PANES.indexOf(next) * width,
        animated: true,
      });
    },
    [width]
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.switchWrap, { paddingTop: insets.top + 6 }]}>
        <View style={styles.switch}>
          {/*
            The pill is the full height of the track and flush to its edge —
            no inset ring of grey around the selected half, just white to the
            corner, curved to the same radius as the track it sits in.
          */}
          <Animated.View
            style={[styles.pill, { transform: [{ translateX: slide }] }]}
          />
          <Segment
            label="Wall"
            active={pane === 'wall'}
            onPress={() => select('wall')}
          />
          <Segment
            label="Summary"
            active={pane === 'summary'}
            onPress={() => select('summary')}
          />
        </View>
      </View>

      {/* Both panes stay mounted, which the pager gives for free. The wall
          holds a scroll position and a zoom transform that would be lost on
          every switch otherwise, and the summary is cheap to keep alive. */}
      <Animated.ScrollView
        /* Animated.ScrollView forwards the ref to the ScrollView underneath,
           so scrollTo is really there; only its declared ref type disagrees,
           hence the cast rather than a wider ref type that would lose it. */
        ref={pagerRef as never}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={styles.pane}
      >
        <View style={{ width }}>
          <MemoryWallScreen embedded />
        </View>
        <View style={{ width }}>
          <SummaryScreen embedded />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={styles.segment}
    >
      {/* Label only. The selected background is the sliding pill behind it,
          which is why nothing here paints a fill of its own. */}
      <Text
        numberOfLines={1}
        style={[styles.segmentText, active && styles.segmentTextOn]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  switchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  switch: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 11,
    alignSelf: 'center',
  },
  /* Half the track, full height, sitting at the very edge. */
  pill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SEGMENT_W,
    borderRadius: 11,
    backgroundColor: colors.surface,
  },
  segment: {
    width: SEGMENT_W,
    paddingVertical: 6,
    alignItems: 'center',
  },
  segmentText: { fontSize: 12, color: colors.textSecondary },
  segmentTextOn: { color: colors.textPrimary, fontWeight: '500' },
  pane: { flex: 1 },
});
