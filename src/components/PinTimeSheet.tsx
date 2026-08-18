import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '../lib/geo';
import { colors } from '../theme/colors';
import { TimeStepperRow } from './TimeStepperRow';

/** Quarter hours. Opening times and table bookings both land on them. */
const STEP_MIN = 15;

/** Round to the nearest step, so an arrival of 13:07 opens on 13:00. */
export function roundToStep(minutes: number): number {
  return Math.round(minutes / STEP_MIN) * STEP_MIN;
}

/**
 * Fixing one stop to a time (PRD F6, §3.4).
 *
 * The half of manual planning that is not about order. Somewhere between a
 * booked table and a tour that leaves without you, a day has moments that
 * are not the planner's to choose, and until now the only answer was to
 * arrange the stops and hope the arithmetic landed.
 *
 * A pin means "be there at this time" rather than "not before" — the two
 * are the same control and differ only in what happens when the day cannot
 * make it, which is a sentence on the stop rather than a mode here.
 *
 * Bounded by the day window because a pin outside it describes a day the
 * user has already said they are not having. The alternative — accepting
 * it and reporting failure — spends a warning on something the control
 * could have prevented.
 */
export function PinTimeSheet({
  placeName,
  pinned,
  suggested,
  dayStartMin,
  homeByMin,
  onPin,
  onClear,
  onClose,
}: {
  placeName: string;
  /** The pin as it stands, if there is one. */
  pinned?: number;
  /** Where to start when there is not — the stop's own arrival time. */
  suggested: number;
  dayStartMin: number;
  homeByMin: number;
  onPin: (minutes: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const clamp = (m: number) => Math.max(dayStartMin, Math.min(homeByMin, m));
  const [value, setValue] = useState(() =>
    clamp(roundToStep(pinned ?? suggested))
  );

  /**
   * The sheet is mounted per stop, but a re-render with a different stop
   * would otherwise keep the first one's time — the state initialiser only
   * runs once. Keyed by name at the call site as well; this is the belt.
   */
  useEffect(() => {
    setValue(clamp(roundToStep(pinned ?? suggested)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeName]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallow taps on the card itself so they do not dismiss. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Be at {placeName}</Text>
          <Text style={styles.sub}>
            The day will hold this time — waiting if it gets there early, and
            saying so if it cannot get there at all. Everything else stays the
            planner&apos;s to work out.
          </Text>

          <TimeStepperRow
            label="At"
            value={value}
            onLess={() => setValue((v) => clamp(v - STEP_MIN))}
            onMore={() => setValue((v) => clamp(v + STEP_MIN))}
            lessDisabled={value <= dayStartMin}
            moreDisabled={value >= homeByMin}
            lessLabel="Earlier"
            moreLabel="Later"
          />

          <Text style={styles.note}>
            Within your day, {formatTime(dayStartMin)} to{' '}
            {formatTime(homeByMin)}. Widen the day to pin a time outside it.
          </Text>

          {/*
            Three labels rather than two. "Change to 13:00" on a sheet where
            nothing has been changed is a button describing an action it is
            not about to take — opening the sheet to check a time and
            leaving it alone is the commonest thing to do here.
          */}
          <Pressable style={styles.done} onPress={() => onPin(value)}>
            <Text style={styles.doneText}>
              {pinned === undefined
                ? 'Pin this time'
                : value === pinned
                  ? `Keep ${formatTime(value)}`
                  : `Change to ${formatTime(value)}`}
            </Text>
          </Pressable>
          {/*
            Only offered once there is something to clear. A disabled button
            that has never been available reads as a feature the user has
            failed to find.
          */}
          {pinned !== undefined && (
            <Pressable style={styles.secondary} onPress={onClear}>
              <Text style={styles.secondaryText}>Let the planner choose</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  secondary: {
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
});
