import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../domain/social';
import { colors } from '../theme/colors';

/**
 * Initials avatar (no remote images in the mock). Identity chrome only —
 * the color comes from the user, deliberately off the clay/category palette.
 */
export function Avatar({ user, size = 32 }: { user: User; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: user.color },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{user.initials}</Text>
    </View>
  );
}

/**
 * Overlapping avatar cluster for members/collaborators, with an optional
 * "+N" overflow chip. Left-to-right, first on top.
 */
export function AvatarStack({
  users,
  size = 26,
  max = 4,
}: {
  users: User[];
  size?: number;
  max?: number;
}) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  const overlap = size * 0.32;
  return (
    <View style={styles.row}>
      {shown.map((u, i) => (
        <View key={u.id} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: max - i }}>
          <View style={styles.ring}>
            <Avatar user={u} size={size} />
          </View>
        </View>
      ))}
      {extra > 0 && (
        <View
          style={[
            styles.more,
            { width: size, height: size, borderRadius: size / 2, marginLeft: -overlap },
          ]}
        >
          <Text style={styles.moreText}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInput,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  moreText: { fontSize: 10, fontWeight: '500', color: colors.textSecondary },
});
