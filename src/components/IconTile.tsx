import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Category } from '../domain/types';
import { categoryColors, tint } from '../theme/colors';
import { categoryIcon } from './icons';

/**
 * Place-card icon tile per ui-guide §5: 44×44, radius 12, category tint
 * background (split-tint when two categories), icon in the full primary
 * category color.
 */
export function IconTile({ categories, size = 44 }: { categories: Category[]; size?: number }) {
  const shown = categories.slice(0, 2);
  const primary = shown[0];
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <View style={styles.halves}>
        {shown.map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: tint(categoryColors[c]) }} />
        ))}
      </View>
      <MaterialCommunityIcons
        name={categoryIcon[primary]}
        size={size * 0.45}
        color={categoryColors[primary]}
      />
    </View>
  );
}

/**
 * Timeline stop node per ui-guide §5: 30px circle, category tint background,
 * route number in the full category color (13/500).
 */
export function TimelineNode({
  categories,
  label,
}: {
  categories: Category[];
  label: string;
}) {
  const shown = categories.slice(0, 2);
  return (
    <View style={styles.node}>
      <View style={styles.halves}>
        {shown.map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: tint(categoryColors[c]) }} />
        ))}
      </View>
      <Text style={[styles.nodeNumber, { color: categoryColors[shown[0]] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halves: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  node: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeNumber: {
    fontSize: 13,
    fontWeight: '500',
  },
});
