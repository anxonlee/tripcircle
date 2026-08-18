import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '../lib/geo';
import { colors } from '../theme/colors';

/**
 * A labelled time with a minus and a plus.
 *
 * Extracted from DayWindowControl when pinning a stop's time needed the
 * same control (PRD F6, §3.4). Steppers rather than a wheel picker is a
 * decision worth keeping in one place: the times here move in quarter
 * hours, a wheel invites a precision the plan does not have, and two taps
 * beats a scroll for the adjustment people actually make.
 */
export function TimeStepperRow({
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
      // 32pt buttons, tapped repeatedly to walk the time along. Reaches the
      // 44pt minimum without growing the control.
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

const styles = StyleSheet.create({
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
});
