import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { Category } from '../domain/types';
import { categoryIcon } from './icons';
import { categoryColors } from '../theme/colors';

/**
 * Themed cover for feed posts and trips — no remote imagery in the mock, so
 * the "photo" is a soft category-tinted panel with a watermark glyph. Primary
 * theme drives the fill; a second theme adds a diagonal wedge (max 2 colors,
 * PRD §6.1). Content (title, meta) is overlaid via children.
 */
export function CoverBlock({
  themes,
  height = 132,
  radius = 16,
  style,
  children,
}: {
  themes: Category[];
  height?: number;
  radius?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const shown = themes.slice(0, 2);
  const primary = shown[0];
  const secondary = shown[1];
  return (
    <View style={[styles.cover, { height, borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `${categoryColors[primary]}26` }]} />
      {secondary && (
        <View style={[styles.wedge, { backgroundColor: `${categoryColors[secondary]}24` }]} />
      )}
      <MaterialCommunityIcons
        name={categoryIcon[primary]}
        size={height * 0.62}
        color={`${categoryColors[primary]}33`}
        style={styles.watermark}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden', justifyContent: 'flex-end' },
  wedge: {
    position: 'absolute',
    top: -40,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  watermark: { position: 'absolute', right: 10, top: 6 },
});
