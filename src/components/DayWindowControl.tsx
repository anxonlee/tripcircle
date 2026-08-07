import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '../lib/geo';
import {
  LATEST_HOME_BY_MIN,
  MIN_DAY_WINDOW_MIN,
  clampDayWindow,
  type DayWindow,
} from '../lib/planner';
import { colors } from '../theme/colors';

/** How far one tap moves an end of the window. */
const STEP_MIN = 15;

/**
 * The outing window, and the only way to change it (PRD §3.3.0.2).
 *
 * Deliberately not a gate and not a setup step. The store ships defaults, the
 * day is already solved by the time this is on screen, and this only adjusts
 * it afterwards — §3.3.0.2 is firm that no time input may stand between the
 * user and their first output.
 *
 * The whole 24 hours is reachable. What is not is a window crossing midnight:
 * `clampDayWindow` keeps `homeByMin` inside the same day, so a day running
 * into the small hours is out of scope rather than quietly wrapping.
 */
export function DayWindowControl({
  window,
  onChange,
}: {
  window: DayWindow;
  onChange: (next: DayWindow) => void;
}) {
  const [open, setOpen] = useState(false);

  const nudge = (field: keyof DayWindow, by: number) => {
    const next = clampDayWindow({ ...window, [field]: window[field] + by });
    // Stepping the start forward can push the end along with it. Report the
    // clamped pair rather than the requested one, so what persists is what
    // the user sees.
    onChange(next);
  };

  // Disable a step only where it genuinely cannot move. A button that presses
  // and does nothing is worse than one that is visibly unavailable.
  const atEarliestStart = window.dayStartMin <= 0;
  const atLatestStart =
    window.dayStartMin >= LATEST_HOME_BY_MIN - MIN_DAY_WINDOW_MIN;
  const atEarliestEnd =
    window.homeByMin <= window.dayStartMin + MIN_DAY_WINDOW_MIN;
  const atLatestEnd = window.homeByMin >= LATEST_HOME_BY_MIN;

  return (
    <>
      <Pressable
        style={styles.chip}
        onPress={() => setOpen(true)}
        // The chip is ~21pt tall, well under the 44pt minimum, and was
        // genuinely hard to hit on a device. Padding it out to 44 would make
        // it the heaviest thing in the sheet header; the hit area grows
        // instead and the chip stays the size it should be.
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={`Day window, ${formatTime(window.dayStartMin)} to ${formatTime(window.homeByMin)}. Tap to change.`}
      >
        <MaterialCommunityIcons
          name="clock-outline"
          size={13}
          color={colors.textSecondary}
        />
        <Text style={styles.chipText}>
          {formatTime(window.dayStartMin)} – {formatTime(window.homeByMin)}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Swallow taps on the card itself so they do not dismiss. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>Your day</Text>
            <Text style={styles.sub}>
              The plan is rebuilt as you change this. Nothing is lost by trying
              a shorter day.
            </Text>

            <Row
              label="Leave"
              value={window.dayStartMin}
              onLess={() => nudge('dayStartMin', -STEP_MIN)}
              onMore={() => nudge('dayStartMin', STEP_MIN)}
              lessDisabled={atEarliestStart}
              moreDisabled={atLatestStart}
              lessLabel="Earlier"
              moreLabel="Later"
            />
            <Row
              label="Home by"
              value={window.homeByMin}
              onLess={() => nudge('homeByMin', -STEP_MIN)}
              onMore={() => nudge('homeByMin', STEP_MIN)}
              lessDisabled={atEarliestEnd}
              moreDisabled={atLatestEnd}
              lessLabel="Earlier"
              moreLabel="Later"
            />

            <Text style={styles.note}>
              {formatDuration(window.homeByMin - window.dayStartMin)} available.
              A day ends at 23:59 at the latest.
            </Text>

            <Pressable style={styles.done} onPress={() => setOpen(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Row({
  label,
  value,
  onLess,
  onMore,
  lessDisabled,
  moreDisabled,
  lessLabel,
  moreLabel,
}: {
  label: string;
  value: number;
  onLess: () => void;
  onMore: () => void;
  lessDisabled?: boolean;
  moreDisabled?: boolean;
  lessLabel: string;
  moreLabel: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Step
          icon="minus"
          onPress={onLess}
          disabled={lessDisabled}
          label={`${lessLabel} ${label}`}
        />
        <Text style={styles.rowValue}>{formatTime(value)}</Text>
        <Step
          icon="plus"
          onPress={onMore}
          disabled={moreDisabled}
          label={`${moreLabel} ${label}`}
        />
      </View>
    </View>
  );
}

function Step({
  icon,
  onPress,
  disabled,
  label,
}: {
  icon: 'minus' | 'plus';
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // 32pt buttons, tapped repeatedly to walk the time along. Same reason
      // as the chip: reach the 44pt minimum without growing the control.
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.step, disabled && styles.stepDisabled]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={17}
        color={disabled ? colors.textMuted : colors.textPrimary}
      />
    </Pressable>
  );
}

/** "6 h 45 min" — the window's length, not a plan duration. */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: colors.surfaceAlt,
    marginTop: 3,
  },
  chipText: { fontSize: 12, color: colors.textSecondary },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, color: colors.textPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    minWidth: 54,
    textAlign: 'center',
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  stepDisabled: { opacity: 0.4 },
  note: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  done: {
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: 2,
  },
  doneText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
});
