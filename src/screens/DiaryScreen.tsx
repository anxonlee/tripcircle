import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoryIcon } from '../components/icons';
import {
  canEditVisit,
  editWindowLeft,
  visitPlaceName,
  type Visit,
} from '../domain/diary';
import type { RootStackParamList } from '../navigation';
import type { CuratedPlace } from '../domain/types';
import { listPlacesForHistory } from '../services/places';
import { useDiaryStore } from '../store/useDiaryStore';
import { categoryColors, colors, tint } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Diary'>;

const DESTRUCTIVE = '#C1554A';
const GO_AGAIN_COLOR = {
  yes: colors.positive,
  maybe: '#B8860B',
  no: DESTRUCTIVE,
} as const;

/**
 * Every visit, newest first, with a way to remove one.
 *
 * The memory wall is the diary you look at; this is the one you manage. It
 * exists because the privacy policy promises deletion inside the app, and a
 * right the software does not implement is not a right — `removeVisit` had
 * no UI until this screen.
 *
 * Deletion is explicit rather than a swipe: it is irreversible, it takes the
 * visit's photo with it, and there is no undo. A confirmation naming the
 * place is cheap next to losing the wrong memory.
 */
export function DiaryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const visits = useDiaryStore((s) => s.visits);
  const removeVisit = useDiaryStore((s) => s.removeVisit);

  /**
   * Resolved through the service, not the seed list. A visit may name a place
   * the user added themselves, or one they have since put away, and reading
   * the dataset directly renders both as "Unknown place".
   */
  const [places, setPlaces] = useState<CuratedPlace[]>([]);
  useEffect(() => {
    listPlacesForHistory().then(setPlaces);
  }, []);

  const placeById = useMemo(
    () => new Map(places.map((p) => [p.id, p])),
    [places]
  );

  const ordered = useMemo(
    () => [...visits].sort((a, b) => b.timestamp - a.timestamp),
    [visits]
  );

  const confirmDelete = (visit: Visit) => {
    const place = placeById.get(visit.placeId);
    Alert.alert(
      'Delete this visit?',
      `${visitPlaceName(visit, place)} · ${formatDate(visit.timestamp)}\n\n` +
        (visit.photoUri
          ? 'The note and photo from this visit are removed for good.'
          : 'This visit is removed for good.') +
        ' Other visits to the same place are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeVisit(visit.id),
        },
      ]
    );
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
          <Text style={styles.title}>All visits</Text>
          <Text style={styles.count}>
            {ordered.length} {ordered.length === 1 ? 'visit' : 'visits'} on this
            device
          </Text>
        </View>
      </View>

      <FlatList
        data={ordered}
        keyExtractor={(v) => v.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 32 },
        ]}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing stamped yet. Visits you record show up here.
          </Text>
        }
        renderItem={({ item }) => {
          const place = placeById.get(item.placeId);
          const theme = place?.themes[0];
          const editable = canEditVisit(item);
          const Row = editable ? Pressable : View;
          return (
            <Row
              style={styles.row}
              {...(editable
                ? {
                    onPress: () =>
                      navigation.navigate('EditVisit', { visitId: item.id }),
                  }
                : {})}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: GO_AGAIN_COLOR[item.wouldGoAgain] },
                ]}
              />
              {item.photoUri ? (
                <Image source={{ uri: item.photoUri }} style={styles.thumb} />
              ) : (
                <View
                  style={[
                    styles.thumb,
                    styles.thumbPlaceholder,
                    theme
                      ? { backgroundColor: tint(categoryColors[theme]) }
                      : null,
                  ]}
                >
                  {theme ? (
                    <MaterialCommunityIcons
                      name={categoryIcon[theme]}
                      size={16}
                      color={categoryColors[theme]}
                    />
                  ) : null}
                </View>
              )}

              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {visitPlaceName(item, place)}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {place ? `${place.district} · ` : ''}
                  {formatDate(item.timestamp)}
                </Text>
                {item.note ? (
                  <Text style={styles.note} numberOfLines={2}>
                    {item.note}
                  </Text>
                ) : null}
                {editable && (
                  <Text style={styles.editable}>
                    Tap to edit · {hoursLeft(editWindowLeft(item))}
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => confirmDelete(item)}
                hitSlop={10}
                style={styles.delete}
                accessibilityLabel={`Delete visit to ${place?.name ?? 'this place'}`}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </Row>
          );
        }}
      />
    </View>
  );
}

/** Compact remaining-window label for the edit hint. */
function hoursLeft(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h left` : 'under an hour left';
}

/** Absolute date — a management list needs the day, not "3w ago". */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 6,
  },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  count: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 15 },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  editable: { fontSize: 11, color: colors.accent, marginTop: 1 },
  delete: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: 40,
    lineHeight: 19,
  },
});
