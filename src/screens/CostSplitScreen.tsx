import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { NavHeader } from '../components/NavHeader';
import type { CostShare, Trip } from '../domain/social';
import { formatYen } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { tripsService } from '../services/trips';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'CostSplit'>;

interface Transfer {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

/**
 * Greedy settle-up: everyone owes an equal share; net each person's balance
 * and match the biggest debtor to the biggest creditor until settled. Pure —
 * no rounding drift beyond yen. (Phase 2 cost splitting.)
 */
function settleUp(shares: CostShare[]): Transfer[] {
  const total = shares.reduce((s, x) => s + x.paidYen, 0);
  const fair = total / shares.length;
  const balances = shares.map((s) => ({
    id: s.user.id,
    name: s.user.name,
    net: Math.round(s.paidYen - fair),
  }));
  const creditors = balances.filter((b) => b.net > 0).sort((a, b) => b.net - a.net);
  const debtors = balances.filter((b) => b.net < 0).sort((a, b) => a.net - b.net);
  const out: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.net, -d.net);
    if (amount > 0) {
      out.push({ fromId: d.id, fromName: d.name, toId: c.id, toName: c.name, amount });
    }
    c.net -= amount;
    d.net += amount;
    if (c.net === 0) ci += 1;
    if (d.net === 0) di += 1;
  }
  return out;
}

/** Cost splitting (Phase 2): total spend, each person's fair share, and the
 *  minimal set of transfers to settle up. */
export function CostSplitScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [shares, setShares] = useState<CostShare[]>([]);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([tripsService.getTrip(tripId), tripsService.getCostShares(tripId)]).then(
      ([t, s]) => {
        if (!alive) return;
        if (t) setTrip(t);
        setShares(s);
      }
    );
    return () => {
      alive = false;
    };
  }, [tripId]);

  const total = useMemo(() => shares.reduce((s, x) => s + x.paidYen, 0), [shares]);
  const fair = shares.length ? Math.round(total / shares.length) : 0;
  const transfers = useMemo(() => settleUp(shares), [shares]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader title="Split the cost" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {trip && <Text style={styles.tripTitle}>{trip.title}</Text>}
        <View style={styles.totalCard}>
          <View style={styles.totalCell}>
            <Text style={styles.totalValue}>{formatYen(total)}</Text>
            <Text style={styles.totalLabel}>Total spend</Text>
          </View>
          <View style={styles.vline} />
          <View style={styles.totalCell}>
            <Text style={styles.totalValue}>{formatYen(fair)}</Text>
            <Text style={styles.totalLabel}>Each person</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Who paid</Text>
        <View style={styles.card}>
          {shares.map((s, i) => {
            const net = Math.round(s.paidYen - fair);
            return (
              <View key={s.user.id} style={[styles.payRow, i > 0 && styles.rowDivider]}>
                <Avatar user={s.user} size={32} />
                <View style={styles.payText}>
                  <Text style={styles.payName}>
                    {s.user.id === 'you' ? 'You' : s.user.name}
                  </Text>
                  <Text style={styles.paySub}>paid {formatYen(s.paidYen)}</Text>
                </View>
                <Text
                  style={[
                    styles.balance,
                    net > 0 ? styles.balancePos : net < 0 ? styles.balanceNeg : styles.balanceEven,
                  ]}
                >
                  {net > 0
                    ? `gets back ${formatYen(net)}`
                    : net < 0
                    ? `owes ${formatYen(-net)}`
                    : 'settled'}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Settle up</Text>
        <View style={styles.card}>
          {transfers.length === 0 ? (
            <Text style={styles.settledText}>Everyone's even — nothing to settle.</Text>
          ) : (
            transfers.map((t, i) => (
              <View key={i} style={[styles.transferRow, i > 0 && styles.rowDivider]}>
                <Text style={styles.transferText}>
                  <Text style={styles.transferName}>
                    {t.fromId === 'you' ? 'You' : t.fromName}
                  </Text>
                  <Text style={styles.transferMid}> pay </Text>
                  <Text style={styles.transferName}>
                    {t.toId === 'you' ? 'you' : t.toName}
                  </Text>
                </Text>
                <Text style={styles.transferAmount}>{formatYen(t.amount)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {transfers.length > 0 && (
        <View style={styles.footer}>
          {requested ? (
            <View style={styles.doneBtn}>
              <MaterialCommunityIcons name="check" size={18} color={colors.positive} />
              <Text style={styles.doneText}>Settle-up requests sent</Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}
              onPress={() => setRequested(true)}
            >
              <Text style={styles.primaryText}>Send settle-up requests</Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  tripTitle: { fontSize: 18, fontWeight: '500', color: colors.textPrimary, paddingTop: 4 },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  totalCell: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: 22, fontWeight: '500', color: colors.textPrimary },
  totalLabel: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  vline: { width: 1, height: 36, backgroundColor: colors.borderStrong },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    paddingTop: 22,
    paddingBottom: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  payText: { flex: 1 },
  payName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  paySub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  balance: { fontSize: 12, fontWeight: '500' },
  balancePos: { color: colors.positive },
  balanceNeg: { color: colors.textSecondary },
  balanceEven: { color: colors.textMuted },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  transferText: { fontSize: 14, color: colors.textSecondary },
  transferName: { fontWeight: '500', color: colors.textPrimary },
  transferMid: { color: colors.textMuted },
  transferAmount: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  settledText: { fontSize: 13, color: colors.textMuted, paddingVertical: 14 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { opacity: 0.9 },
  primaryText: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.positive,
    backgroundColor: colors.selectedWell,
  },
  doneText: { fontSize: 15, fontWeight: '500', color: colors.positive },
});
