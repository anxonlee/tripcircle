import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { WallCard } from '../domain/diary';
import { tiltFor } from '../lib/wallLayout';
import { categoryColors, colors, tint } from '../theme/colors';
import { categoryIcon } from './icons';

const GO_AGAIN_COLOR = {
  yes: colors.positive,
  maybe: '#B8860B',
  no: '#C1554A',
} as const;

export const STAMP_W = 62;
/** Sized explicitly so the name chip can run wider than the polaroid. */
const SLOT_W = 108;
const SLOT_H = 88;
/** Anchored at the polaroid's middle, matching CategoryPin.PIN_ANCHOR. */
const STAMP_ANCHOR = { x: 0.5, y: 27 / SLOT_H };

/**
 * A stamped memory pinned at the place it happened (PRD §3A.3).
 *
 * The wall is the map: each visit is a small polaroid sitting on its real
 * coordinates, tilted by the same stable per-place hash the board layout uses
 * so a place looks like itself in either view. Kept deliberately small —
 * several of these cluster in one district, and a card big enough to read
 * comfortably would bury its neighbours.
 */
export function MapStamp({
  card,
  onPress,
  scale = 1,
  showName = true,
}: {
  card: WallCard;
  onPress?: () => void;
  /** Zoom tier from the wall — see MemoryWallScreen.stampTier. */
  scale?: number;
  showName?: boolean;
}) {
  const { place, stats, latestVisit } = card;
  const primary = place.themes[0];
  const photoUri = latestVisit.photoUri;

  // A marker rendered from a React view must keep re-rasterising until its
  // image has actually loaded, or the map caches an empty frame. Only photo
  // stamps need it, and only until the first load resolves.
  const [tracks, setTracks] = useState(!!photoUri);

  // Everything is derived from the tier so the polaroid shrinks with the map
  // instead of swallowing its neighbours when zoomed out.
  const w = Math.round(STAMP_W * scale);
  const media = Math.round(42 * scale);
  const slotW = Math.round(SLOT_W * scale);
  const slotH = Math.round(SLOT_H * scale);

  /**
   * The mount carries the would-go-again answer, so it shrinks with the rest
   * of the polaroid but never to nothing — at the furthest tier a
   * proportional 1.33 would read as an artefact of the shadow rather than a
   * colour. Half-point steps because these are rendered into a marker
   * bitmap, where a third of a point is invisible.
   */
  const mount = Math.max(1.5, Math.round(3.5 * scale * 2) / 2);
  const radius = Math.max(3, Math.round(7 * scale));
  const mediaRadius = Math.max(2, Math.round(4 * scale));

  return (
    <Marker
      coordinate={place.location}
      anchor={STAMP_ANCHOR}
      tracksViewChanges={tracks}
      onPress={onPress}
    >
      <View style={[styles.slot, { width: slotW, height: slotH }]}>
        {/*
          The would-go-again answer colours the polaroid's mount rather than
          sitting as a band beneath the photo. Same information, no extra
          element: the border was already there as white padding, so this
          costs nothing in height — which matters when several of these
          cluster in one district.
        */}
        <View
          style={[
            styles.stamp,
            {
              width: w,
              padding: mount,
              borderRadius: radius,
              backgroundColor: GO_AGAIN_COLOR[latestVisit.wouldGoAgain],
              transform: [{ rotate: `${tiltFor(place.id)}deg` }],
            },
          ]}
        >
          <View style={[styles.media, { height: media, borderRadius: mediaRadius }]}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={styles.photo}
                onLoadEnd={() => setTracks(false)}
              />
            ) : (
              <View
                style={[
                  styles.placeholder,
                  { backgroundColor: tint(categoryColors[primary]) },
                ]}
              >
                <MaterialCommunityIcons
                  name={categoryIcon[primary]}
                  size={Math.round(20 * scale)}
                  color={categoryColors[primary]}
                />
              </View>
            )}
            {stats.visitCount > 1 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{stats.visitCount}</Text>
              </View>
            )}
          </View>
        </View>
        {/* Ties the polaroid to the exact point it sits on. */}
        <View style={styles.stem} />
        {showName && (
          <View style={[styles.nameChip, { maxWidth: slotW }]}>
            <Text style={styles.nameText} numberOfLines={1}>
              {place.name}
            </Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'flex-end' },
  stamp: {
    // borderRadius, padding and backgroundColor are all per-card: the mount
    // is the would-go-again answer and scales with the zoom tier.
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  media: { overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  countBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
  },
  countText: { fontSize: 9, fontWeight: '500', color: colors.textSecondary },
  stem: {
    width: 1.5,
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  /** The wall should read without tapping: every memory says where it is. */
  nameChip: {
    marginTop: 2,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  nameText: { fontSize: 9.5, fontWeight: '500', color: colors.textPrimary },
});
