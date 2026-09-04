import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

/**
 * A day out is running, and you are somewhere else in the app.
 *
 * A day out is hours long and mostly spent outside the app — stamping a
 * visit, checking the diary, looking something up in Explore. Every one of
 * those took the user off the running day and left them to find their way
 * back to it. This is the way back: always in the same place, always one
 * tap, and it says which stop they are on so it is worth reading rather
 * than only tapping.
 *
 * It springs in rather than appearing, because it arrives while the user is
 * looking at a screen they did not expect to change — motion is what makes
 * that read as an answer to what they just did rather than a glitch.
 */
export function DayOutBanner() {
  const startedAt = useTripStore((s) => s.dayStartedAt);
  const step = useTripStore((s) => s.startDayStep);
  const total = useTripStore((s) => s.selectedPlaceIds.length);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // The banner is the topmost thing on the screen, so it owns the inset.
  // Without this it renders under the clock and the battery.
  const insets = useSafeAreaInsets();

  const endDayOut = useTripStore((s) => s.endDayOut);

  /**
   * A day out does not survive to the next one.
   *
   * Without this the flag persists indefinitely: someone who set off on
   * Saturday and never tapped Done still sees "stop 2 of 4" on Tuesday, and
   * tapping it lands on "your day window has passed". TripCircle plans single
   * days, so the calendar date is the whole test.
   */
  const staleDay =
    startedAt !== null &&
    new Date(startedAt).toDateString() !== new Date().toDateString();

  useEffect(() => {
    if (staleDay) endDayOut();
  }, [staleDay, endDayOut]);

  const running = startedAt !== null && total > 0 && !staleDay;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: running ? 1 : 0,
      useNativeDriver: true,
      // Enough overshoot to read as a pop, not enough to wobble: this sits
      // under the status bar and a bouncy chrome element reads as broken.
      damping: 15,
      stiffness: 180,
      mass: 0.6,
    }).start();
  }, [running, slide]);

  // Unmounted when there is no day, so it costs nothing on every other
  // screen and cannot intercept a tap meant for what is underneath.
  if (!running) return null;

  const stop = Math.min(step + 1, total);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 6,
          opacity: slide,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [-40, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        style={styles.banner}
        onPress={() => navigation.navigate('StartDay')}
        accessibilityRole="button"
        accessibilityLabel={`Day out in progress, stop ${stop} of ${total}. Tap to go back to it.`}
      >
        <MaterialCommunityIcons name="walk" size={15} color="#FFFFFF" />
        <Text style={styles.text}>
          Day out · stop {stop} of {total}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={17} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 6, backgroundColor: colors.surface },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: colors.accent,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '500', color: '#FFFFFF' },
});
