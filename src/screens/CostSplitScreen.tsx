import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  balances,
  formatCents,
  parseAmount,
  settleUp,
} from '../lib/costSplit';
import type { RootStackParamList } from '../navigation';
import { payersFrom, useSplitStore } from '../store/useSplitStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'CostSplit'>;

/**
 * Splitting what a day cost (PRD F16, §3.7).
 *
 * The screen is deliberately a ledger rather than a wallet. §487 rules out
 * moving money — that is money-transmission licensing, not a feature — so
 * this records who paid for what, works out who owes whom, and stops. The
 * copy says so plainly rather than leaving someone to discover it after
 * tapping something hopefully.
 *
 * No accounts, so the people here are names typed on this phone. Nobody is
 * invited and nobody is notified; the way this leaves the device is as text
 * in a message, which is also how most people already settle up.
 */
export function CostSplitScreen({ navigation, route }: Props) {
  /**
   * The day's fares, handed over by the Plan screen so this screen never
   * has to solve a day of its own. Offered rather than added: the plan
   * knows what the travel cost, and only the user knows who paid it.
   */
  const suggestCents = route.params?.suggestCents ?? 0;
  const insets = useSafeAreaInsets();
  const people = useSplitStore((s) => s.people);
  const expenses = useSplitStore((s) => s.expenses);
  const addPerson = useSplitStore((s) => s.addPerson);
  const removePerson = useSplitStore((s) => s.removePerson);
  const addExpense = useSplitStore((s) => s.addExpense);
  const removeExpense = useSplitStore((s) => s.removeExpense);
  const clearSplit = useSplitStore((s) => s.clearSplit);

  const [nameDraft, setNameDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [amountDraft, setAmountDraft] = useState('');
  const [payerDraft, setPayerDraft] = useState<string | null>(null);

  const payers = useMemo(() => payersFrom(people, expenses), [people, expenses]);
  const totalCents = payers.reduce((sum, p) => sum + p.paidCents, 0);
  const transfers = useMemo(() => settleUp(payers), [payers]);
  const nets = useMemo(() => new Map(balances(payers).map((b) => [b.id, b.net])), [payers]);

  const payer = payerDraft ?? people[0]?.id ?? null;
  const amountCents = parseAmount(amountDraft);
  const canAdd = payer !== null && amountCents !== null && amountCents > 0;

  const commitExpense = () => {
    if (!canAdd) return;
    addExpense({ label: labelDraft.trim(), cents: amountCents, payerId: payer });
    setLabelDraft('');
    setAmountDraft('');
  };

  const shareSplit = () => {
    const lines = [
      `Splitting ${formatCents(totalCents)} ${people.length} ways`,
      ...people.map(
        (p) =>
          `${p.name} paid ${formatCents(
            payers.find((x) => x.id === p.id)?.paidCents ?? 0
          )}`
      ),
      '',
      ...(transfers.length > 0
        ? transfers.map((t) => `${t.fromName} → ${t.toName}: ${formatCents(t.cents)}`)
        : ['Everyone is square.']),
    ];
    void Share.share({ message: lines.join('\n') });
  };

  const confirmClear = () => {
    Alert.alert('Clear this split?', 'The people and everything they paid for go.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearSplit },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={26}
            color={colors.textSecondary}
          />
        </Pressable>
        <Text style={styles.title}>Split the cost</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Spent between you</Text>
          <Text style={styles.totalValue}>{formatCents(totalCents)}</Text>
          {people.length > 0 && (
            <Text style={styles.totalNote}>
              {/*
                "about", when it does not divide evenly. Two people splitting
                $9.75 owe $4.88 and $4.87, and a flat "$4.87 each" is the
                kind of small untruth that costs a money feature its
                credibility the first time someone checks it.
              */}
              {totalCents % people.length === 0 ? '' : 'about '}
              {formatCents(Math.floor(totalCents / people.length))} each,{' '}
              {people.length} {people.length === 1 ? 'person' : 'people'}
            </Text>
          )}
        </View>

        <Section title="Who was there">
          {people.map((p) => {
            const net = nets.get(p.id) ?? 0;
            return (
              <View key={p.id} style={styles.row}>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowPaid}>
                  paid {formatCents(payers.find((x) => x.id === p.id)?.paidCents ?? 0)}
                </Text>
                <Text
                  style={[
                    styles.rowNet,
                    net > 0 && styles.owedText,
                    net < 0 && styles.owesText,
                  ]}
                >
                  {net === 0 ? 'square' : net > 0 ? `+${formatCents(net)}` : formatCents(net)}
                </Text>
                <Pressable
                  onPress={() => removePerson(p.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${p.name} and what they paid`}
                >
                  <MaterialCommunityIcons name="close" size={15} color={colors.textMuted} />
                </Pressable>
              </View>
            );
          })}

          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="Add someone"
              placeholderTextColor={colors.textMuted}
              value={nameDraft}
              onChangeText={setNameDraft}
              onSubmitEditing={() => {
                if (nameDraft.trim()) addPerson(nameDraft);
                setNameDraft('');
              }}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addBtn, !nameDraft.trim() && styles.addBtnOff]}
              disabled={!nameDraft.trim()}
              onPress={() => {
                addPerson(nameDraft);
                setNameDraft('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Add this person"
            >
              <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </Section>

        {people.length > 0 && (
          <Section title="What was paid">
            {expenses.map((e) => (
              <View key={e.id} style={styles.row}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {e.label || 'Something'}
                </Text>
                <Text style={styles.rowPaid}>
                  {people.find((p) => p.id === e.payerId)?.name ?? 'someone'}
                </Text>
                <Text style={styles.rowNet}>{formatCents(e.cents)}</Text>
                <Pressable
                  onPress={() => removeExpense(e.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${e.label || 'this expense'}`}
                >
                  <MaterialCommunityIcons name="close" size={15} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}

            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, styles.inputWide]}
                placeholder="What for"
                placeholderTextColor={colors.textMuted}
                value={labelDraft}
                onChangeText={setLabelDraft}
              />
              <TextInput
                style={[styles.input, styles.inputAmount]}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={amountDraft}
                onChangeText={setAmountDraft}
                keyboardType="decimal-pad"
                onSubmitEditing={commitExpense}
              />
              <Pressable
                style={[styles.addBtn, !canAdd && styles.addBtnOff]}
                disabled={!canAdd}
                onPress={commitExpense}
                accessibilityRole="button"
                accessibilityLabel="Add this expense"
              >
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
              </Pressable>
            </View>

            {suggestCents > 0 && !expenses.some((e) => e.label === 'Travel') && (
              <Pressable
                style={styles.suggest}
                onPress={() => {
                  setLabelDraft('Travel');
                  setAmountDraft((suggestCents / 100).toFixed(2));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Fill in today's fares, ${formatCents(suggestCents)}`}
              >
                <MaterialCommunityIcons
                  name="train-car"
                  size={13}
                  color={colors.textSecondary}
                />
                <Text style={styles.suggestText}>
                  Today's fares came to {formatCents(suggestCents)} — fill it in
                </Text>
              </Pressable>
            )}

            {/* Who paid, as chips — a picker for two or three names would be
                more machinery than the choice deserves. */}
            <View style={styles.payerRow}>
              {people.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPayerDraft(p.id)}
                  style={[styles.payerChip, p.id === payer && styles.payerChipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: p.id === payer }}
                  accessibilityLabel={`${p.name} paid this`}
                >
                  <Text
                    style={[
                      styles.payerText,
                      p.id === payer && styles.payerTextOn,
                    ]}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Section>
        )}

        {transfers.length > 0 && (
          <Section title="Settling up">
            {transfers.map((t, i) => (
              <View key={i} style={styles.settleRow}>
                <Text style={styles.settleText}>
                  <Text style={styles.settleName}>{t.fromName}</Text> pays{' '}
                  <Text style={styles.settleName}>{t.toName}</Text>
                </Text>
                <Text style={styles.settleAmount}>{formatCents(t.cents)}</Text>
              </View>
            ))}
            {/*
              Said once, here, where someone is looking at an amount and
              deciding what to do about it. The app has no payment rail and
              is never going to: §487 keeps money movement out entirely.
            */}
            <Text style={styles.note}>
              PIRT keeps the arithmetic. Paying each other happens wherever
              you already do it — nothing here moves money.
            </Text>
          </Section>
        )}

        {people.length > 1 && transfers.length === 0 && totalCents > 0 && (
          <Text style={styles.square}>Everyone is square.</Text>
        )}

        {people.length > 0 && (
          <View style={styles.actions}>
            <Pressable style={styles.primary} onPress={shareSplit}>
              <MaterialCommunityIcons name="tray-arrow-up" size={16} color="#FFFFFF" />
              <Text style={styles.primaryText}>Send the split</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={confirmClear}>
              <Text style={styles.secondaryText}>Start a new one</Text>
            </Pressable>
          </View>
        )}

        {people.length === 0 && (
          <Text style={styles.empty}>
            Add whoever was with you, then what each of you paid for. PIRT
            works out who owes whom.
          </Text>
        )}
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  headerSpacer: { flex: 1 },
  content: { padding: 16, gap: 18 },
  totalBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    padding: 16,
    gap: 3,
  },
  totalLabel: { fontSize: 12, color: colors.textSecondary },
  totalValue: { fontSize: 26, fontWeight: '600', color: colors.textPrimary },
  totalNote: { fontSize: 12, color: colors.textMuted },
  section: { gap: 9 },
  sectionTitle: { fontSize: 12, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  rowPaid: { fontSize: 12, color: colors.textMuted },
  rowNet: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, minWidth: 66, textAlign: 'right' },
  owedText: { color: colors.accent },
  owesText: { color: colors.warning },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceInput,
    fontSize: 13,
    color: colors.textPrimary,
  },
  inputWide: { flex: 2 },
  inputAmount: { flex: 1, textAlign: 'right' },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addBtnOff: { opacity: 0.35 },
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: colors.surfaceInput,
  },
  suggestText: { fontSize: 12, color: colors.textSecondary },
  payerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  payerChip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: colors.surfaceInput,
  },
  payerChipOn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  payerText: { fontSize: 12, color: colors.textSecondary },
  payerTextOn: { color: colors.textPrimary, fontWeight: '500' },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  settleText: { fontSize: 13, color: colors.textSecondary },
  settleName: { color: colors.textPrimary, fontWeight: '500' },
  settleAmount: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  note: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  square: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  empty: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  actions: { gap: 9 },
  primary: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  secondary: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
});
