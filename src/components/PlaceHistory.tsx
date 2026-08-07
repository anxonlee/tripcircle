import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Visit } from '../domain/diary';
import type { CuratedPlace } from '../domain/types';
import { ordinal, relativeDays } from '../lib/format';
import { colors } from '../theme/colors';

const GO_AGAIN_COLOR = {
  yes: colors.positive,
  maybe: '#B8860B',
  no: '#C1554A',
} as const;

/** How many past visits to show before collapsing the rest into a count. */
const SHOWN = 3;

/**
 * What you already know about this place, shown while stamping it.
 *
 * The stamp screen used to leave half a screen empty below the note. Filling
 * it with curation fields would have been decoration — hours, price, and
 * address are planning data, and you are standing in the place when this
 * appears. Your own history is the thing that is actually useful here: last
 * time's note is what makes this one worth writing, and it is the Place/Visit
 * split (PRD §3A) made visible — eight visits, eight notes.
 *
 * It grows with use. First visit shows the curator's tip instead and stays
 * deliberately short rather than padding itself out.
 *
 * Showing other people's notes here was considered and parked for Phase 2/3.
 * It needs a backend the app deliberately does not have — the privacy policy
 * promises no server and nothing transmitted, and the App Store declaration
 * is Data Not Collected on that basis — and PRD §10 gates any user content
 * behind a DMCA agent and report/block/appeal flows. Seeding invented notes
 * from imaginary visitors is not a substitute; the curator `tips` field is
 * the sanctioned way to put a human voice in this slot (§12.2).
 */
export function PlaceHistory({
  place,
  past,
  now = Date.now(),
}: {
  place: CuratedPlace;
  /** This place's earlier visits, newest first. */
  past: Visit[];
  now?: number;
}) {
  if (past.length === 0) {
    return (
      <View style={styles.block}>
        <View style={styles.firstRow}>
          <MaterialCommunityIcons
            name="map-marker-plus-outline"
            size={15}
            color={colors.textMuted}
          />
          <Text style={styles.firstText}>First time here</Text>
        </View>
        {place.tips ? (
          <View style={styles.tip}>
            <Text style={styles.tipText}>{place.tips}</Text>
            <Text style={styles.tipBy}>Note from the curator</Text>
          </View>
        ) : null}
      </View>
    );
  }

  const days = Math.floor((now - past[0].timestamp) / 86_400_000);
  const shown = past.slice(0, SHOWN);
  const hidden = past.length - shown.length;

  return (
    <View style={styles.block}>
      <Text style={styles.heading}>
        Your {ordinal(past.length + 1)} visit · last one {relativeDays(days)}
      </Text>

      {shown.map((v) => (
        <View key={v.id} style={styles.row}>
          <View
            style={[styles.dot, { backgroundColor: GO_AGAIN_COLOR[v.wouldGoAgain] }]}
          />
          {v.photoUri ? (
            <Image source={{ uri: v.photoUri }} style={styles.thumb} />
          ) : null}
          <View style={styles.rowBody}>
            {v.note ? (
              <Text style={styles.note} numberOfLines={2}>
                {v.note}
              </Text>
            ) : (
              <Text style={styles.noNote}>No note that time</Text>
            )}
            <Text style={styles.when}>
              {relativeDays(Math.floor((now - v.timestamp) / 86_400_000))}
            </Text>
          </View>
        </View>
      ))}

      {hidden > 0 ? (
        <Text style={styles.more}>
          and {hidden} earlier {hidden === 1 ? 'visit' : 'visits'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, paddingTop: 2 },
  heading: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  thumb: { width: 34, height: 34, borderRadius: 8 },
  rowBody: { flex: 1, gap: 2 },
  note: { fontSize: 12, color: colors.textPrimary, lineHeight: 16 },
  noNote: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  when: { fontSize: 11, color: colors.textMuted },
  more: { fontSize: 11, color: colors.textMuted },

  firstRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  firstText: { fontSize: 12, color: colors.textMuted },
  tip: {
    padding: 11,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    gap: 4,
  },
  tipText: { fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
  tipBy: { fontSize: 10, color: colors.textMuted },
});
