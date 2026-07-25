import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoverBlock } from '../components/CoverBlock';
import { NavHeader } from '../components/NavHeader';
import { TimelineNode } from '../components/IconTile';
import type { Category, Place } from '../domain/types';
import { formatDuration, formatUsd } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'AiPlan'>;

interface Prompt {
  label: string;
  title: string;
  theme: Category;
  stopIds: string[];
  reply: string;
}

/** Canned "generations" — the conversational planner reduced to a mock so the
 *  loop (prompt → plan → open) is fully walkable without a model. */
const PROMPTS: Prompt[] = [
  {
    label: 'A food day under $60',
    title: 'Food day under $60',
    theme: 'food',
    stopIds: ['ferry-building', 'la-taqueria', 'golden-gate-bakery', 'el-farolito'],
    reply: "Here's a food-first day that stays under $60. Market breakfast, a Mission burrito, egg tarts in Chinatown, then late-night al pastor.",
  },
  {
    label: 'Quiet historical morning',
    title: 'Quiet historical morning',
    theme: 'historical',
    stopIds: ['mission-dolores', 'cable-car-museum', 'chinatown-dragon-gate', 'coit-tower'],
    reply: 'A calm morning through the old city — start at Mission Dolores before the crowds, drift up to Coit Tower.',
  },
  {
    label: 'Parks and slow coffee',
    title: 'Parks and slow coffee',
    theme: 'nature',
    stopIds: ['japanese-tea-garden', 'sightglass-coffee', 'dolores-park'],
    reply: 'Two big green spaces with a slow coffee in between. Easy pace, lots of park.',
  },
];

interface Turn {
  prompt: Prompt;
  stops: Place[];
  costUsd: number;
  durationMin: number;
}

/**
 * Conversational planning (Phase 4). Describe the day; TripCircle drafts a
 * plan you can open. Pushed over tabs, so its single clay action is "Open this
 * plan", which seeds the day store and jumps to the routed plan.
 */
export function AiPlanScreen({ navigation }: Props) {
  const setSelection = useTripStore((s) => s.setSelection);
  const [places, setPlaces] = useState<Map<string, Place>>(new Map());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    placesService.listPlaces().then((ps) => setPlaces(new Map(ps.map((p) => [p.id, p]))));
  }, []);

  const generate = (prompt: Prompt) => {
    const stops = prompt.stopIds
      .map((id) => places.get(id))
      .filter((p): p is Place => !!p);
    const costUsd = stops.reduce((s, p) => s + p.avgCostUsd, 0);
    const durationMin =
      stops.reduce((s, p) => s + p.visitDurationMin, 0) + (stops.length - 1) * 18;
    setTurns((t) => [...t, { prompt, stops, costUsd, durationMin }]);
    setDraft('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  };

  const openPlan = (turn: Turn) => {
    setSelection(turn.prompt.stopIds);
    navigation.navigate('Plan');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader title="Plan with AI" onBack={() => navigation.goBack()} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <MaterialCommunityIcons name="creation" size={20} color={colors.accent} />
          </View>
          <Text style={styles.introText}>
            Tell me what kind of day you want and I'll draft a plan from your city.
          </Text>
        </View>

        {turns.map((turn, i) => (
          <View key={i} style={styles.turn}>
            <View style={styles.userBubble}>
              <Text style={styles.userText}>{turn.prompt.label}</Text>
            </View>
            <Text style={styles.reply}>{turn.prompt.reply}</Text>
            <View style={styles.planCard}>
              <CoverBlock themes={[turn.prompt.theme]} height={74} radius={12} style={styles.planCover}>
                <Text style={styles.planTitle}>{turn.prompt.title}</Text>
              </CoverBlock>
              <View style={styles.planMeta}>
                <Text style={styles.planMetaText}>
                  {turn.stops.length} stops · {formatDuration(turn.durationMin)} · about{' '}
                  {formatUsd(turn.costUsd)}
                </Text>
              </View>
              <View style={styles.planStops}>
                {turn.stops.map((s, idx) => (
                  <View key={s.id} style={styles.planStop}>
                    <TimelineNode categories={s.categories} label={String(idx + 1)} />
                    <Text style={styles.planStopName} numberOfLines={1}>
                      {s.name}
                    </Text>
                  </View>
                ))}
              </View>
              <Pressable
                style={({ pressed }) => [styles.openBtn, pressed && styles.openPressed]}
                onPress={() => openPlan(turn)}
              >
                <Text style={styles.openText}>Open this plan</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.suggestLabel}>Try</Text>
        <View style={styles.suggestions}>
          {PROMPTS.map((p) => (
            <Pressable key={p.label} style={styles.suggestChip} onPress={() => generate(p)}>
              <Text style={styles.suggestText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.inputBar}>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Describe your day"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <Pressable
          style={styles.sendBtn}
          onPress={() => generate(PROMPTS[0])}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="arrow-up" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingBottom: 20 },
  intro: { flexDirection: 'row', gap: 10, paddingTop: 6, paddingBottom: 8 },
  introIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.selectedWell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  turn: { marginTop: 14 },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    backgroundColor: colors.surfaceInput,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  userText: { fontSize: 14, color: colors.textPrimary },
  reply: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 12 },
  planCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
  },
  planCover: { justifyContent: 'flex-end' },
  planTitle: { fontSize: 16, fontWeight: '500', color: colors.textPrimary, padding: 10 },
  planMeta: { paddingTop: 10 },
  planMetaText: { fontSize: 12, color: colors.textMuted },
  planStops: { gap: 8, paddingTop: 12 },
  planStop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planStopName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    marginTop: 14,
  },
  openPressed: { backgroundColor: colors.surfaceAlt },
  openText: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  suggestLabel: { fontSize: 12, color: colors.textMuted, paddingTop: 22, paddingBottom: 8 },
  suggestions: { gap: 8 },
  suggestChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  suggestText: { fontSize: 14, color: colors.textSecondary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderStrong,
  },
  inputPill: {
    flex: 1,
    backgroundColor: colors.surfaceInput,
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 44,
    justifyContent: 'center',
  },
  input: { fontSize: 14, color: colors.textPrimary },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
