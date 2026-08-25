import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SignIn } from '../components/SignIn';
import type { CuratedPlace } from '../domain/types';
import { formatTime } from '../lib/geo';
import { serverMessage } from '../lib/serverError';
import type { RootStackParamList } from '../navigation';
import { publishDay } from '../services/feed';
import { placesService } from '../services/places';
import { hasBackend } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'PublishDay'>;

/**
 * Putting a day in the feed.
 *
 * The screen shows exactly what is about to leave the phone, itemised, and
 * says what is not going with it. That list is short and worth reading:
 * publishing a day is the first thing this app does that other people can
 * see, and the difference between what a person assumes they are sharing and
 * what they actually are is where the harm in this kind of feature lives.
 */
export function PublishDayScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const dayOrder = useTripStore((s) => s.dayOrder);
  const dayStartMin = useTripStore((s) => s.dayStartMin);
  const homeByMin = useTripStore((s) => s.homeByMin);
  const goal = useTripStore((s) => s.goal);

  const [all, setAll] = useState<CuratedPlace[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void placesService.listPlaces().then(setAll);
  }, []);

  /** In the arrangement the user made, if they made one. */
  const places = useMemo(() => {
    const byId = new Map(all.map((p) => [p.id, p]));
    const ids = dayOrder
      ? [
          ...dayOrder.filter((id) => selectedIds.includes(id)),
          ...selectedIds.filter((id) => !dayOrder.includes(id)),
        ]
      : selectedIds;
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is CuratedPlace => p !== undefined)
      .map((p) => ({ placeId: p.id, placeName: p.name }));
  }, [all, selectedIds, dayOrder]);

  const publish = async () => {
    if (!session || places.length === 0) return;
    setBusy(true);
    try {
      const id = await publishDay({
        authorId: session.user.id,
        title,
        note,
        dayStartMin,
        homeByMin,
        goal,
        places,
      });
      navigation.replace('Post', { id });
    } catch (e) {
      Alert.alert('Could not publish that', serverMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>Publish this day</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {!hasBackend ? (
          <Text style={styles.body}>
            This build has no server configured, so publishing is off.
          </Text>
        ) : status !== 'signedIn' ? (
          <SignIn />
        ) : places.length === 0 ? (
          <Text style={styles.body}>
            There is no day to publish. Choose some places first.
          </Text>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Give the day a name"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              editable={!busy}
            />
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="Anything worth knowing (optional)"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              maxLength={2000}
              multiline
              editable={!busy}
            />

            <Text style={styles.sectionTitle}>What goes with it</Text>
            {places.map((p, i) => (
              <Text key={`${p.placeId}-${i}`} style={styles.item}>
                {i + 1}. {p.placeName}
              </Text>
            ))}
            <Text style={styles.item}>
              The hours you planned for: {formatTime(dayStartMin)} to{' '}
              {formatTime(homeByMin)}
            </Text>
            <Text style={styles.item}>Your display name</Text>

            {/*
              Named individually rather than summarised as "your data is
              safe". A person deciding whether to publish is entitled to the
              actual list, and every line here is a promise the schema keeps
              structurally — there is no column for any of it.
            */}
            <Text style={styles.sectionTitle}>What does not</Text>
            <Text style={styles.item}>Your start place, or any address</Text>
            <Text style={styles.item}>Your diary — visits, notes, ratings, photos</Text>
            <Text style={styles.item}>Your email</Text>

            <Text style={styles.warn}>
              Anyone signed in can read this, plan it themselves, and comment
              on it. You can delete it at any time.
            </Text>

            <Pressable
              style={[styles.primary, (!title.trim() || busy) && styles.primaryOff]}
              disabled={!title.trim() || busy}
              onPress={publish}
            >
              <Text style={styles.primaryText}>
                {busy ? 'Publishing…' : 'Publish'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
  content: { padding: 16, gap: 9 },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  input: {
    minHeight: 44,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingTop: 12,
    backgroundColor: colors.surfaceInput,
    fontSize: 14,
    color: colors.textPrimary,
  },
  noteInput: { minHeight: 84 },
  sectionTitle: { fontSize: 12, color: colors.textSecondary, marginTop: 10 },
  item: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  warn: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: 8 },
  primary: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: 10,
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
});
