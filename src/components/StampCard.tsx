import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PassportStamp } from '../domain/social';
import { colors } from '../theme/colors';

/**
 * A travel-passport stamp (Phase 3): dashed-border card with the city code in
 * its single accent color, visit count, city/country, and last-visited. Shared
 * by the Passport screen and the profile's Passport tab.
 */
export function StampCard({ stamp }: { stamp: PassportStamp }) {
  return (
    <View style={[styles.stamp, { borderColor: `${stamp.color}66` }]}>
      <View style={styles.top}>
        <Text style={[styles.code, { color: stamp.color }]}>{stamp.code}</Text>
        <View style={[styles.visitChip, { backgroundColor: `${stamp.color}1F` }]}>
          <Text style={[styles.visitText, { color: stamp.color }]}>×{stamp.visits}</Text>
        </View>
      </View>
      <Text style={styles.city}>{stamp.city}</Text>
      <Text style={styles.country}>{stamp.country}</Text>
      <Text style={styles.date}>{stamp.lastVisited}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    width: '48%',
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontSize: 22, fontWeight: '500', letterSpacing: 1 },
  visitChip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  visitText: { fontSize: 11, fontWeight: '500' },
  city: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, marginTop: 10 },
  country: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  date: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
});
