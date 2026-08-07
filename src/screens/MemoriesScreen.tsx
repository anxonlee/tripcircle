import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemoryWallScreen } from './MemoryWallScreen';
import { SummaryScreen } from './SummaryScreen';
import { colors } from '../theme/colors';

type Pane = 'wall' | 'summary';

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
  const [pane, setPane] = useState<Pane>('wall');

  return (
    <View style={styles.screen}>
      <View style={[styles.switchWrap, { paddingTop: insets.top + 6 }]}>
        <View style={styles.switch}>
          <Segment
            label="Wall"
            active={pane === 'wall'}
            onPress={() => setPane('wall')}
          />
          <Segment
            label="Summary"
            active={pane === 'summary'}
            onPress={() => setPane('summary')}
          />
        </View>
      </View>

      {/* Both panes stay mounted. The wall holds a scroll position and a
          zoom transform that would be lost on every switch otherwise, and
          the summary is cheap to keep alive. */}
      <View style={styles.pane}>
        <View style={[StyleSheet.absoluteFill, pane === 'wall' ? null : styles.hidden]}>
          <MemoryWallScreen embedded />
        </View>
        <View
          style={[StyleSheet.absoluteFill, pane === 'summary' ? null : styles.hidden]}
        >
          <SummaryScreen embedded />
        </View>
      </View>
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
      style={[styles.segment, active && styles.segmentOn]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextOn]}>
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
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 11,
    padding: 3,
    alignSelf: 'center',
  },
  segment: {
    paddingVertical: 6,
    paddingHorizontal: 22,
    borderRadius: 9,
  },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 12, color: colors.textSecondary },
  segmentTextOn: { color: colors.textPrimary, fontWeight: '500' },
  pane: { flex: 1 },
  hidden: { opacity: 0, pointerEvents: 'none' },
});
