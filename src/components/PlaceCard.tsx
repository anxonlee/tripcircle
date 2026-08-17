import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CuratedPlace } from '../domain/types';
import { formatPlacePrice } from '../lib/format';
import { openStatus } from '../lib/openStatus';
import { categoryLabels, colors } from '../theme/colors';
import { IconTile } from './IconTile';

export const CARD_HEIGHT = 76;
export const CARD_GAP = 9;

// "Open now" / "Usually open" logic lives in src/lib/openStatus.ts, pure and
// tested with fake timers — see the comment there for why estimated hours
// are hedged.

/**
 * Place card per ui-guide §5: tinted icon tile · name / meta (theme, price
 * band) / status · right distance + select control.
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
  place: CuratedPlace;
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
      <IconTile categories={place.themes} />
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {/*
            No rating here, by design. Google ratings are live-only under PRD
            §12.2 and a list view is the one place they may never be fetched.
            The card says what the place is and what it costs — both ours.
          */}
          <Text>
            {place.themes
              .slice(0, 2)
              .map((c) => categoryLabels[c])
              .join(' · ')}
          </Text>
          {/*
            No band on a place found live: OpenStreetMap records no price,
            and the field holds a placeholder only because the type demands
            one. Printing it would invent the cheapest thing a card can say.
          */}
          {formatPlacePrice(place) ? (
            <Text> · {formatPlacePrice(place)}</Text>
          ) : null}
          {/*
            A place the user typed in, or one the app merely found, has to be
            tellable apart from one the dataset supplied — for them, because
            the hours are a guess rather than a record, and for us, because
            any description of the dataset has to be able to exclude both.
          */}
          {place.source === 'mine' ? (
            <Text style={styles.cardMine}> · yours</Text>
          ) : place.source === 'osm' ? (
            <Text style={styles.cardMine}> · from the map</Text>
          ) : null}
        </Text>
        <Text style={styles.cardStatus} numberOfLines={1}>
          {status.open ? (
            <>
              <Text style={styles.cardOpen}>{status.label}</Text>
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
  cardMine: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
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
