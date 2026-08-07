import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { WallCard } from '../domain/diary';
import { relativeDays } from '../lib/format';
import { CARD_H, CARD_W } from '../lib/wallLayout';
import { categoryColors, colors, tint } from '../theme/colors';
import { categoryIcon } from './icons';

/** Green go-again / amber maybe / red no (PRD §3A.3). */
const GO_AGAIN_STYLE = {
  yes: { color: colors.positive, label: 'Go again' },
  maybe: { color: '#B8860B', label: 'Maybe' },
  no: { color: '#C1554A', label: 'No' },
} as const;

/**
 * One scrapbook card on the memory wall. Photo (or a category-tinted stand-in
 * when the visit had none), place name, the latest visit's note, and the
 * would-go-again chip.
 *
 * The visit count is shown only when a place has been stamped more than once
 * — it is a fact about the collection, not a score, and PRD §3A.7 rules out
 * anything that reads as a streak or a tally to keep up.
 */
export function WallPlaceCard({ card }: { card: WallCard }) {
  const { place, stats, latestVisit } = card;
  const primary = place.themes[0];
  const goAgain = GO_AGAIN_STYLE[latestVisit.wouldGoAgain];

  return (
    <View style={styles.card}>
      <View style={styles.media}>
        {latestVisit.photoUri ? (
          <Image source={{ uri: latestVisit.photoUri }} style={styles.photo} />
        ) : (
          <View
            style={[styles.placeholder, { backgroundColor: tint(categoryColors[primary]) }]}
          >
            <MaterialCommunityIcons
              name={categoryIcon[primary]}
              size={26}
              color={categoryColors[primary]}
            />
          </View>
        )}
        {stats.visitCount > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{stats.visitCount} visits</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        {latestVisit.note ? (
          <Text style={styles.note} numberOfLines={2}>
            {latestVisit.note}
          </Text>
        ) : (
          <Text style={styles.when}>{relativeDays(stats.daysSinceLastVisit)}</Text>
        )}
        <View style={styles.footer}>
          <View style={[styles.chip, { borderColor: goAgain.color }]}>
            <View style={[styles.dot, { backgroundColor: goAgain.color }]} />
            <Text style={[styles.chipText, { color: goAgain.color }]}>
              {goAgain.label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    // Pinned-to-a-board feel; the guide allows shadow on floating elements.
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  media: { height: 84 },
  photo: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  countText: { fontSize: 10, color: colors.textSecondary },
  body: { flex: 1, padding: 9, gap: 3 },
  name: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  note: { fontSize: 11, color: colors.textSecondary, lineHeight: 14 },
  when: { fontSize: 11, color: colors.textMuted },
  footer: { flex: 1, justifyContent: 'flex-end' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  chipText: { fontSize: 10, fontWeight: '500' },
});
