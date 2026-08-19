import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { summarize, type Period } from '../lib/summary';
import type { RootStackParamList } from '../navigation';
import type { CuratedPlace } from '../domain/types';
import { listPlacesForHistory } from '../services/places';
import { useDiaryStore } from '../store/useDiaryStore';
import { categoryLabels, colors } from '../theme/colors';

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

const FULL_MONTHS =
  'January February March April May June July August September October November December'.split(
    ' '
  );

/**
 * What the period is called.
 *
 * A month and a year are named, not bounded: "August 2026" is how someone
 * refers to the month, where "Aug 1 – 31" reads as a report about it. Only
 * the week has no name of its own, so only the week gets dates.
 */
function rangeLabel(period: Period, startMs: number, endMs: number): string {
  const a = new Date(startMs);
  if (period === 'year') return String(a.getFullYear());
  if (period === 'month') return `${FULL_MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  const b = new Date(endMs - 1);
  const left = `${MONTHS[a.getMonth()]} ${a.getDate()}`;
  const right =
    a.getMonth() === b.getMonth()
      ? `${b.getDate()}`
      : `${MONTHS[b.getMonth()]} ${b.getDate()}`;
  return `${left} – ${right}`;
}

const PERIODS: { id: Period; label: string; heading: string; empty: string }[] = [
  {
    id: 'week',
    label: 'Week',
    heading: 'Your week in places',
    empty: 'Nothing stamped this week yet. Your recap fills in as you go.',
  },
  {
    id: 'month',
    label: 'Month',
    heading: 'Your month in places',
    empty: 'Nothing stamped this month yet.',
  },
  {
    id: 'year',
    label: 'Year',
    heading: 'Your year in places',
    empty: 'Nothing stamped this year yet.',
  },
];

/**
 * Weekly recap (PRD §3A.4, FD4).
 *
 * Composed from the visit log on open. Nothing is auto-posted and no live
 * location is exposed — sharing is a deliberate tap that hands plain text to
 * the OS share sheet. Every recap ends with the forward hook into planning.
 */
/** `embedded` when hosted inside the diary tab, which owns the top inset. */
export function SummaryScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const visits = useDiaryStore((s) => s.visits);

  /**
   * Through the service, so a week containing a place the user added counts
   * it. Reading the seed list directly left those visits out of the summary
   * they belong to.
   */
  const [places, setPlaces] = useState<CuratedPlace[]>([]);
  useEffect(() => {
    listPlacesForHistory().then(setPlaces);
  }, []);

  const [period, setPeriod] = useState<Period>('week');
  const meta = PERIODS.find((p) => p.id === period) ?? PERIODS[0];

  const summary = useMemo(
    () => summarize(places, visits, period),
    [places, visits, period]
  );

  const onShare = () => {
    const lines = [
      `${meta.heading} · ${rangeLabel(period, summary.startMs, summary.endMs)}`,
      `${summary.visitCount} visits across ${summary.placeCount} places`,
      summary.districts.length > 0 ? `${summary.districts.join(', ')}` : null,
      summary.goAgain.length > 0
        ? `Would go again: ${summary.goAgain.map((p) => p.name).join(', ')}`
        : null,
    ].filter(Boolean);
    Share.share({ message: lines.join('\n') });
  };

  const empty = summary.visitCount === 0;

  return (
    <View style={[styles.screen, { paddingTop: embedded ? 0 : insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{meta.heading}</Text>
          <Text style={styles.range}>
            {rangeLabel(period, summary.startMs, summary.endMs)}
          </Text>
        </View>
        {!empty && (
          <Pressable style={styles.iconButton} onPress={onShare} hitSlop={8}>
            <MaterialCommunityIcons
              name="share-variant-outline"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
      </View>

      {/*
        Under the header rather than over it, so the title reads as the
        answer to the switch. Three segments and no swipe: the diary tab
        already owns the horizontal gesture for Wall/Summary, and a second
        pager inside it would fight the first.
      */}
      <View style={styles.periodBar}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPeriod(p.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: p.id === period }}
            accessibilityLabel={`${p.label} recap`}
            style={[styles.periodSeg, p.id === period && styles.periodSegOn]}
          >
            <Text
              style={[
                styles.periodText,
                p.id === period && styles.periodTextOn,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {empty ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name="calendar-blank-outline"
              size={26}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>{meta.empty}</Text>
          </View>
        ) : (
          <>
            <View style={styles.statRow}>
              <Stat label="Visits" value={String(summary.visitCount)} />
              <Stat label="Places" value={String(summary.placeCount)} />
              <Stat label="New" value={String(summary.newPlaceCount)} />
            </View>

            {summary.districts.length > 0 && (
              <Section title="Where you went">
                <Text style={styles.body}>{summary.districts.join(' · ')}</Text>
              </Section>
            )}

            {summary.themes.length > 0 && (
              <Section title="What you did">
                <Text style={styles.body}>
                  {summary.themes
                    .map((t) => `${categoryLabels[t.theme]} ×${t.count}`)
                    .join(' · ')}
                </Text>
              </Section>
            )}

            {summary.goAgain.length > 0 && (
              <Section title="Would go again">
                {summary.goAgain.map((p) => (
                  <View key={p.id} style={styles.goAgainRow}>
                    <View style={styles.goAgainDot} />
                    <Text style={styles.body}>{p.name}</Text>
                  </View>
                ))}
              </Section>
            )}

            {summary.photoCount > 0 && (
              <Section title="Photos">
                <Text style={styles.body}>
                  {summary.photoCount} {summary.photoCount === 1 ? 'photo' : 'photos'} kept
                </Text>
              </Section>
            )}
          </>
        )}

        {summary.overdue && (
          <View style={styles.nudge}>
            <Text style={styles.nudgeText}>
              You liked {summary.overdue.place.name} but haven't been in{' '}
              {Math.floor(summary.overdue.daysSince / 30)} months.
            </Text>
          </View>
        )}

        {/* The forward hook every recap ends on (PRD §3A.4). */}
        <Pressable style={styles.primary} onPress={() => navigation.navigate('DayPlan')}>
          <MaterialCommunityIcons name="map-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryText}>Plan a day out</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  /*
    The same recessed track the objective bar and the diary switch use, at
    the smaller size this one earns: choosing a period is a lighter act than
    choosing what the optimiser is for.
  */
  periodBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 2,
    borderRadius: 11,
    backgroundColor: colors.surfaceAlt,
  },
  periodSeg: {
    flex: 1,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodSegOn: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  periodText: { fontSize: 12, color: colors.textSecondary },
  periodTextOn: { color: colors.textPrimary, fontWeight: '500' },
  backup: {
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    gap: 8,
  },
  backupTitle: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  backupNote: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  backupRow: { flexDirection: 'row', gap: 9 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  privacyText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  secondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    minHeight: 44,
  },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  range: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInput,
  },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  statRow: { flexDirection: 'row', gap: 9 },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  statLabel: { fontSize: 11, color: colors.textMuted },
  statValue: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  section: { gap: 6 },
  sectionTitle: { fontSize: 11, color: colors.textMuted },
  body: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  goAgainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goAgainDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.positive,
  },
  nudge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 12,
  },
  nudgeText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  primaryText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
});
