import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { NavHeader } from '../components/NavHeader';
import { StampCard } from '../components/StampCard';
import type { RootStackParamList } from '../navigation';
import { passportStamps } from '../services/mock/trips';
import { currentUser } from '../services/mock/users';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Passport'>;

/**
 * Travel passport (Phase 3): a stamp per city the user has planned days in,
 * with lifetime stats. Display-only, so no clay — the stamp colors are the
 * only accent, capped one-per-stamp (ui-guide §2).
 */
export function PassportScreen({ navigation }: Props) {
  const cities = passportStamps.length;
  const days = passportStamps.reduce((s, x) => s + x.visits, 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader title="Travel passport" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Avatar user={currentUser} size={56} />
          <Text style={styles.name}>{currentUser.name}</Text>
          <Text style={styles.home}>Based in {currentUser.homeCity}</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat value={String(cities)} label="Cities" />
          <View style={styles.vline} />
          <Stat value={String(days)} label="Days out" />
          <View style={styles.vline} />
          <Stat value="47" label="Places saved" />
        </View>

        <Text style={styles.sectionLabel}>Stamps</Text>
        <View style={styles.grid}>
          {passportStamps.map((s) => (
            <StampCard key={s.city} stamp={s} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 4, gap: 4 },
  name: { fontSize: 18, fontWeight: '500', color: colors.textPrimary, marginTop: 8 },
  home: { fontSize: 13, color: colors.textMuted },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  vline: { width: 1, height: 30, backgroundColor: colors.borderStrong },
  sectionLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, paddingTop: 24, paddingBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
