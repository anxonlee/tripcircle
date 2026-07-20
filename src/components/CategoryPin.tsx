import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Category } from '../domain/types';
import { colors, pinColors } from '../theme/colors';

/**
 * Map pin per ui-guide §5: 24–28px category-color circle, 2.5px white ring,
 * pin shadow; split vertically for multi-category (primary left, max two
 * colors); optional white route number (13/500) after optimization.
 */
export function CategoryPin({
  categories,
  size = 24,
  label,
}: {
  categories: Category[];
  size?: number;
  label?: string;
}) {
  const cols = pinColors(categories);
  return (
    <View style={[styles.pin, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={styles.halves}>
        {cols.map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      {label != null && <Text style={styles.number}>{label}</Text>}
    </View>
  );
}

/** Start-place pin: clay circle, white home glyph, 3px white ring (ui-guide §5). */
export function StartPin({ size = 28 }: { size?: number }) {
  return (
    <View
      style={[
        styles.pin,
        styles.startPin,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <MaterialCommunityIcons name="home" size={size * 0.5} color="#FFFFFF" />
    </View>
  );
}

const PIN_SLOT = 44;
const LABEL_ZONE = 20;

/**
 * Fixed-size wrapper for Marker children so the map coordinate stays anchored
 * at the pin's center whether or not the name label chip is showing.
 * Pass `PIN_ANCHOR` as the Marker's `anchor`.
 */
export const PIN_ANCHOR = { x: 0.5, y: PIN_SLOT / 2 / (PIN_SLOT + LABEL_ZONE) };

export function PinSlot({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <View style={[styles.slot, { width: label ? 120 : PIN_SLOT }]}>
      <View style={styles.slotPin}>{children}</View>
      {label != null && (
        <View style={styles.labelChip}>
          <Text style={styles.labelText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  startPin: {
    backgroundColor: colors.accent,
    borderWidth: 3,
  },
  halves: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  number: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
  slot: {
    height: PIN_SLOT + LABEL_ZONE,
    alignItems: 'center',
  },
  slotPin: {
    height: PIN_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelChip: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 118,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  labelText: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textPrimary,
  },
});
