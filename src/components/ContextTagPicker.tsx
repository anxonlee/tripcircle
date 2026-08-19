import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ContextTags } from '../domain/diary';
import { colors } from '../theme/colors';

/**
 * Who you were with and how the visit felt (PRD §14 Phase 2, `ContextTags`).
 *
 * The type has existed since the diary was designed and nothing wrote to it,
 * which made it a promise rather than a feature. What it is for: the same
 * ramen shop is a different place on a Tuesday alone and a Saturday with
 * four friends, and the diary could record the visit but not the difference.
 *
 * Chips rather than fields, and every one of them optional. This sits on a
 * screen whose whole design is that a stamp costs one tap, so anything here
 * that could be mistaken for a question to answer would be a tax on the
 * thing the app most needs people to keep doing.
 *
 * Tapping a chosen chip clears it. There is no "none" chip because there is
 * no such answer — unset means the user did not say, which is different from
 * having been alone, and a chip labelled "no one" would collect both.
 *
 * `occasion` is deliberately absent. It is free text on a screen built to
 * avoid the keyboard, and the note field already takes anything a person
 * wants to write.
 */

const COMPANIONS: { id: NonNullable<ContextTags['companion']>; label: string }[] = [
  { id: 'solo', label: 'Solo' },
  { id: 'date', label: 'Date' },
  { id: 'family', label: 'Family' },
  { id: 'friends', label: 'Friends' },
];

const PACES: { id: NonNullable<ContextTags['pace']>; label: string }[] = [
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'packed', label: 'Packed' },
];

export function ContextTagPicker({
  value,
  onChange,
  editable = true,
}: {
  value: ContextTags;
  onChange: (next: ContextTags) => void;
  editable?: boolean;
}) {
  /** Setting the value it already holds clears it — the chips are toggles. */
  const set = <K extends keyof ContextTags>(key: K, next: ContextTags[K]) => {
    if (!editable) return;
    onChange({ ...value, [key]: value[key] === next ? undefined : next });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {COMPANIONS.map((c) => (
          <Chip
            key={c.id}
            label={c.label}
            on={value.companion === c.id}
            editable={editable}
            onPress={() => set('companion', c.id)}
          />
        ))}
      </View>
      <View style={styles.row}>
        {PACES.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            on={value.pace === p.id}
            editable={editable}
            onPress={() => set('pace', p.id)}
          />
        ))}
      </View>
    </View>
  );
}

function Chip({
  label,
  on,
  editable,
  onPress,
}: {
  label: string;
  on: boolean;
  editable: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!editable}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !editable }}
      accessibilityHint={on ? 'Tap to clear' : undefined}
      style={[styles.chip, on && styles.chipOn, !editable && styles.chipReadOnly]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  row: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceInput,
  },
  /*
    A selected chip is a state, not an action, so it takes the muted surface
    rather than the accent — ui-guide §1.3 keeps the accent for the screen's
    primary action, which on this screen is the answer that commits.
  */
  chipOn: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong },
  chipReadOnly: { opacity: 0.75 },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextOn: { color: colors.textPrimary, fontWeight: '500' },
});
