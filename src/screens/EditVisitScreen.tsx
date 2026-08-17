import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StarRating } from '../components/StarRating';
import {
  canEditVisit,
  editWindowLeft,
  visitPlaceName,
  type WouldGoAgain,
} from '../domain/diary';
import type { RootStackParamList } from '../navigation';
import type { CuratedPlace } from '../domain/types';
import { listPlacesForHistory } from '../services/places';
import { useDiaryStore } from '../store/useDiaryStore';
import { colors, tint } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'EditVisit'>;

const GO_AGAIN: { value: WouldGoAgain; label: string; color: string; icon: string }[] = [
  { value: 'yes', label: 'Go again', color: colors.positive, icon: 'check' },
  { value: 'maybe', label: 'Maybe', color: '#B8860B', icon: 'help' },
  { value: 'no', label: 'No', color: '#C1554A', icon: 'close' },
];

/**
 * Correcting a visit inside its edit window (see EDIT_WINDOW_MS).
 *
 * Notes get written in a hurry, standing somewhere, so the first two days
 * allow a fix. After that the entry sets: the diary is a log of what you
 * thought at the time, and the planner reads would-go-again on that basis.
 * Deleting stays available for good — only rewriting expires.
 *
 * The photo is shown but not replaceable. Swapping the image of a visit is
 * closer to rewriting the memory than correcting a typo, and it would need
 * the picker plumbing that lives in StampScreen.
 */
export function EditVisitScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const visits = useDiaryStore((s) => s.visits);
  const updateVisit = useDiaryStore((s) => s.updateVisit);

  const visit = visits.find((v) => v.id === route.params.visitId) ?? null;
  // Through the service, like every other view of a visit. Read straight
  // from the seed list, a place the user added themselves has no name here.
  const [places, setPlaces] = useState<CuratedPlace[]>([]);
  useEffect(() => {
    listPlacesForHistory().then(setPlaces);
  }, []);
  const place = useMemo(
    () => places.find((p) => p.id === visit?.placeId) ?? null,
    [places, visit]
  );

  const [note, setNote] = useState(visit?.note ?? '');
  const [rating, setRating] = useState<number | null>(visit?.rating ?? null);
  const [goAgain, setGoAgain] = useState<WouldGoAgain>(
    visit?.wouldGoAgain ?? 'yes'
  );

  if (!visit) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.gone}>That visit is no longer here.</Text>
      </View>
    );
  }

  const editable = canEditVisit(visit);

  const save = () => {
    updateVisit(visit.id, {
      wouldGoAgain: goAgain,
      // Clearing a field has to mean clearing it, so send undefined rather
      // than skipping the key.
      note: note.trim() ? note.trim() : undefined,
      rating: rating ?? undefined,
    });
    navigation.goBack();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={colors.textSecondary}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {visit ? visitPlaceName(visit, place ?? undefined) : 'This visit'}
          </Text>
          <Text style={styles.sub}>{remainingLabel(editWindowLeft(visit))}</Text>
        </View>
        {editable && (
          <Pressable onPress={save} hitSlop={10}>
            <Text style={styles.save}>Save</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {!editable && (
          <View style={styles.locked}>
            <MaterialCommunityIcons
              name="lock-outline"
              size={15}
              color={colors.textMuted}
            />
            <Text style={styles.lockedText}>
              This visit is more than two days old, so it is kept as written.
              You can still delete it.
            </Text>
          </View>
        )}

        {visit.photoUri ? (
          <Image source={{ uri: visit.photoUri }} style={styles.photo} />
        ) : null}

        <StarRating value={rating} onChange={editable ? setRating : () => {}} />

        <View style={styles.noteWrap}>
          <TextInput
            style={styles.noteInput}
            placeholder="A note about this visit"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
            editable={editable}
            multiline
          />
        </View>

        <Text style={styles.label}>Would you go again?</Text>
        <View style={styles.goAgainRow}>
          {GO_AGAIN.map((opt) => {
            const on = goAgain === opt.value;
            return (
              <Pressable
                key={opt.value}
                disabled={!editable}
                style={[
                  styles.goAgain,
                  { borderColor: on ? opt.color : colors.border },
                  on && { backgroundColor: tint(opt.color) },
                  !editable && styles.dim,
                ]}
                onPress={() => setGoAgain(opt.value)}
              >
                <MaterialCommunityIcons
                  name={opt.icon as never}
                  size={16}
                  color={on ? opt.color : colors.textMuted}
                />
                <Text
                  style={[
                    styles.goAgainText,
                    { color: on ? opt.color : colors.textMuted },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function remainingLabel(ms: number): string {
  if (ms <= 0) return 'Editing closed';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `Editable for another ${hours}h`;
  return `Editable for another ${Math.max(1, Math.floor(ms / 60_000))} min`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: 'center', justifyContent: 'center' },
  gone: { fontSize: 13, color: colors.textMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 6,
  },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  save: { fontSize: 14, fontWeight: '500', color: colors.accent },
  content: { padding: 16, gap: 14 },
  locked: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  lockedText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  photo: { width: '100%', height: 180, borderRadius: 14 },
  noteWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    minHeight: 90,
  },
  noteInput: { fontSize: 13, color: colors.textPrimary, minHeight: 66 },
  label: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  goAgainRow: { flexDirection: 'row', gap: 9 },
  goAgain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
  },
  goAgainText: { fontSize: 13, fontWeight: '500' },
  dim: { opacity: 0.5 },
});
