import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Place } from '../domain/types';
import { formatTime } from '../lib/geo';
import { categoryLabels, colors } from '../theme/colors';
import { IconTile } from './IconTile';

export const CARD_HEIGHT = 76;
export const CARD_GAP = 9;

const PRICE = ['Free', '¥', '¥¥', '¥¥¥', '¥¥¥¥'];

/** "Open now" logic incl. past-midnight closers (close > 24:00). */
function openStatus(p: Place): { open: boolean; text: string } {
  if (!p.openHours) return { open: true, text: '' };
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { open, close } = p.openHours;
  const isOpen =
    (nowMin >= open && nowMin < close) ||
    (nowMin + 1440 >= open && nowMin + 1440 < close);
  return isOpen
    ? { open: true, text: `til ${formatTime(close)}` }
    : { open: false, text: `Opens ${formatTime(open)}` };
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * Place card per ui-guide §5: tinted icon tile · name / meta (amber rating,
 * count, category, price) / status · right distance + select control.
 * Selected = positive border on the selected well.
 */
export function PlaceCard({
  place,
  selected,
  highlighted = false,
  distanceKm,
  onPress,
  onToggle,
}: {
  place: Place;
  selected: boolean;
  highlighted?: boolean;
  distanceKm: number | null;
  onPress: () => void;
  onToggle: () => void;
}) {
  const status = openStatus(place);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        selected && styles.cardSelected,
        highlighted && !selected && styles.cardHighlighted,
      ]}
    >
      <IconTile categories={place.categories} />
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          <Text style={styles.cardRating}>★ {place.rating.toFixed(1)}</Text>
          <Text> ({formatCount(place.reviewCount)}) · </Text>
          <Text>
            {place.categories
              .slice(0, 2)
              .map((c) => categoryLabels[c])
              .join(' · ')}
          </Text>
          <Text> · {PRICE[place.priceLevel]}</Text>
        </Text>
        <Text style={styles.cardStatus} numberOfLines={1}>
          {status.open ? (
            <>
              <Text style={styles.cardOpen}>Open now</Text>
              {status.text ? (
                <Text style={styles.cardStatusMuted}> · {status.text}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.cardStatusMuted}>{status.text}</Text>
          )}
        </Text>
      </View>
      <View style={styles.cardRight}>
        {distanceKm != null && (
          <Text style={styles.cardDistance}>{distanceKm.toFixed(1)} km</Text>
        )}
        <Pressable onPress={onToggle} hitSlop={10}>
          {selected ? (
            <View style={styles.toggleSelected}>
              <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
            </View>
          ) : (
            <View style={styles.toggleEmpty}>
              <MaterialCommunityIcons name="plus" size={16} color={colors.textSecondary} />
            </View>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    marginBottom: CARD_GAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: colors.positive,
    backgroundColor: colors.selectedWell,
  },
  cardHighlighted: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  cardBody: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardRating: { color: '#E8A22F' },
  cardStatus: { fontSize: 11, marginTop: 2 },
  cardOpen: { color: colors.positive, fontSize: 11, fontWeight: '500' },
  cardStatusMuted: { color: colors.textMuted, fontSize: 11 },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 2,
  },
  cardDistance: { fontSize: 12, color: colors.textMuted },
  toggleEmpty: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleSelected: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
