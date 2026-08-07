import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoryIcon } from '../components/icons';
import { PlaceHistory } from '../components/PlaceHistory';
import { StarRating } from '../components/StarRating';
import { visitTimeline, type WouldGoAgain } from '../domain/diary';
import type { CuratedPlace } from '../domain/types';
import type { RootStackParamList } from '../navigation';
import { locationService } from '../services/location';
import { persistVisitPhoto } from '../services/photoStore';
import { placesService } from '../services/places';
import { useDiaryStore } from '../store/useDiaryStore';
import { categoryColors, categoryLabels, colors, tint } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Stamp'>;

const GO_AGAIN: { value: WouldGoAgain; label: string; color: string; icon: string }[] = [
  { value: 'yes', label: 'Go again', color: colors.positive, icon: 'check' },
  { value: 'maybe', label: 'Maybe', color: '#B8860B', icon: 'help' },
  { value: 'no', label: 'No', color: '#C1554A', icon: 'close' },
];

/**
 * Tap-to-stamp (PRD §3A.1, FD1).
 *
 * Two rules shape this screen:
 *  - Would-go-again is the ONE required field, and answering it commits the
 *    stamp. That keeps the floor at a single tap once the place is known.
 *  - Photo, rating, and note are optional and never block. They are filled
 *    in BEFORE the answer, so answering stays the commit action and nothing
 *    stands between the user and a recorded visit.
 *
 * The rating stays collapsed behind a single star until tapped. Would-go-again
 * is the signal the planner reads (domain/diary.ts); stars are colour the
 * user may add for themselves, so they are offered rather than asked.
 *
 * Location is read once, in the foreground, only when this screen asks for
 * it (§3A.6). Nothing is tracked and no fix is stored.
 */
export function StampScreen({ navigation, route }: Props) {
  /**
   * Start day already knows which stop the user is at, so it names the place
   * and this screen opens on the question rather than the search (F7).
   *
   * Its presence also means no location is read at all. Asking where someone
   * is in order to identify a place they have already identified would be a
   * permission prompt bought for nothing, and §3A.6 is that a fix is taken
   * only when it answers something.
   */
  const presetId = route.params?.placeId;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stamp = useDiaryStore((s) => s.stamp);
  const visits = useDiaryStore((s) => s.visits);

  const [nearby, setNearby] = useState<CuratedPlace[]>([]);
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CuratedPlace[]>([]);
  const [place, setPlace] = useState<CuratedPlace | null>(null);

  // The step-2 pane keeps rendering its place while it slides back out, so
  // going back animates instead of blanking on the first frame.
  const [shownPlace, setShownPlace] = useState<CuratedPlace | null>(null);

  // Optional extras, gathered before the committing tap.
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const slide = useSharedValue(0);
  useEffect(() => {
    if (place) setShownPlace(place);
    slide.value = withTiming(place ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [place, slide]);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -slide.value * width }],
  }));

  /**
   * Extras belong to the visit being recorded, so switching to a different
   * place starts them clean — otherwise a note written for one place would
   * follow you to the next.
   */
  const choosePlace = (p: CuratedPlace) => {
    if (p.id !== shownPlace?.id) {
      setRating(null);
      setNote('');
      setPhotoUri(null);
    }
    setPlace(p);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (presetId) {
        const preset = await placesService.getPlace(presetId);
        if (cancelled || !preset) return;
        setPlace(preset);
        setShownPlace(preset);
        setLocating(false);
        return;
      }
      // Foreground-only, one fix, nothing cached — see services/location.ts.
      // The fix arrives already snapped to ~100m, which is ample for "which
      // place am I standing in" and is the only precision §3.1 permits to
      // leave that module.
      const fix = await locationService.getCurrentCoarse();
      if (cancelled) return;
      if (fix.status === 'ok') {
        const near = await placesService.nearbyPlaces(fix.coords, 1.2);
        if (cancelled) return;
        setNearby(near);
        if (near.length === 0) {
          setLocationNote('Nothing curated within a kilometre — search instead');
        }
      } else if (fix.status === 'denied') {
        setLocationNote('Location off — search for the place instead');
      } else {
        setLocationNote('Location unavailable — search for the place instead');
      }
      setLocating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [presetId]);

  useEffect(() => {
    placesService.searchPlaces(query).then(setResults);
  }, [query]);

  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    // Copy out of the picker's cache before it is ever persisted — see
    // services/photoStore.
    setPhotoUri(await persistVisitPhoto(res.assets[0].uri));
  }, []);

  const commit = (wouldGoAgain: WouldGoAgain) => {
    if (!place) return;
    stamp({
      placeId: place.id,
      wouldGoAgain,
      ...(rating != null ? { rating } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(photoUri ? { photoUri } : {}),
    });
    // Stamping from Start day returns to the stop it came from, so the user
    // carries on with the day. Stamping from the tab bar goes to the wall,
    // where the new card lands.
    if (presetId) navigation.goBack();
    else navigation.replace('Tabs');
  };

  const past = useMemo(
    () => (shownPlace ? visitTimeline(shownPlace.id, visits) : []),
    [shownPlace, visits]
  );

  const list = query.trim() ? results : nearby.length > 0 ? nearby : results;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Animated.View style={[styles.track, { width: width * 2 }, trackStyle]}>
        {/* ——— Step 1: which place ——— */}
        <View style={{ width }}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
              <MaterialCommunityIcons
                name="close"
                size={22}
                color={colors.textSecondary}
              />
            </Pressable>
            <Text style={styles.title}>Where are you?</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.search}
              placeholder="Search places"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>

          {locating ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={styles.statusText}>Finding where you are…</Text>
            </View>
          ) : (
            !query.trim() && (
              <Text style={styles.sectionLabel}>{locationNote ?? 'Nearby'}</Text>
            )
          )}

          <FlatList
            data={list}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.placeRow} onPress={() => choosePlace(item)}>
                <View
                  style={[
                    styles.placeIcon,
                    { backgroundColor: tint(categoryColors[item.themes[0]]) },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={categoryIcon[item.themes[0]]}
                    size={18}
                    color={categoryColors[item.themes[0]]}
                  />
                </View>
                <View style={styles.placeBody}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.placeMeta} numberOfLines={1}>
                    {item.district} ·{' '}
                    {item.themes.map((t) => categoryLabels[t]).join(' · ')}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            )}
            ListEmptyComponent={
              locating ? null : (
                <Text style={styles.empty}>No places match that search</Text>
              )
            }
          />
        </View>

        {/* ——— Step 2: the answer commits ——— */}
        <View style={{ width }}>
          {shownPlace && (
            <>
              <View style={styles.header}>
                <Pressable onPress={() => setPlace(null)} hitSlop={10}>
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={24}
                    color={colors.textSecondary}
                  />
                </Pressable>
                <Text style={styles.title} numberOfLines={1}>
                  {shownPlace.name}
                </Text>
                <View style={styles.headerSpacer} />
              </View>
              <Text style={styles.subtitle}>{shownPlace.district}</Text>

              <View style={styles.extras}>
                <Pressable style={styles.extraRow} onPress={pickPhoto}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photoThumb} />
                  ) : (
                    <View style={styles.extraIcon}>
                      <MaterialCommunityIcons
                        name="camera-outline"
                        size={18}
                        color={colors.textSecondary}
                      />
                    </View>
                  )}
                  <Text style={styles.extraLabel}>
                    {photoUri ? 'Photo added' : 'Add a photo'}
                  </Text>
                  <Text style={styles.optional}>optional</Text>
                </Pressable>

                <StarRating value={rating} onChange={setRating} />

                <View style={styles.noteWrap}>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="A note about this visit"
                    placeholderTextColor={colors.textMuted}
                    value={note}
                    onChangeText={setNote}
                    multiline
                  />
                </View>
                <Text style={styles.noteHint}>
                  Notes belong to this visit, not the place — come back and the
                  next one gets its own.
                </Text>

                <View style={styles.historyWrap}>
                  <PlaceHistory place={shownPlace} past={past} />
                </View>
              </View>

              <View style={[styles.commit, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={styles.commitLabel}>Would you go again?</Text>
                <View style={styles.goAgainRow}>
                  {GO_AGAIN.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={({ pressed }) => [
                        styles.goAgain,
                        { borderColor: opt.color },
                        pressed && { backgroundColor: tint(opt.color) },
                      ]}
                      onPress={() => commit(opt.value)}
                    >
                      <MaterialCommunityIcons
                        name={opt.icon as never}
                        size={18}
                        color={opt.color}
                      />
                      <Text style={[styles.goAgainText, { color: opt.color }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  /** Both steps live side by side; the track slides one pane width. */
  track: { flex: 1, flexDirection: 'row' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
    gap: 12,
  },
  headerSpacer: { width: 22 },
  title: { flex: 1, fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: 50,
    marginTop: -4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceInput,
  },
  search: { flex: 1, fontSize: 14, color: colors.textPrimary },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statusText: { fontSize: 12, color: colors.textMuted },
  sectionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
  },
  placeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeBody: { flex: 1 },
  placeName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  placeMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  empty: { fontSize: 12, color: colors.textMuted, paddingTop: 24, textAlign: 'center' },

  extras: { paddingHorizontal: 16, paddingTop: 20, gap: 10, flex: 1 },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  extraIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoThumb: { width: 36, height: 36, borderRadius: 12 },
  extraLabel: { flex: 1, fontSize: 13, color: colors.textPrimary },
  optional: { fontSize: 11, color: colors.textMuted },
  noteWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    minHeight: 72,
  },
  noteInput: { fontSize: 13, color: colors.textPrimary, minHeight: 48 },
  noteHint: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  /**
   * Takes the slack that used to sit empty between the note and the commit
   * block, so the buttons stay in thumb reach without a void above them.
   */
  historyWrap: {
    flex: 1,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  commit: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  commitLabel: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  goAgainRow: { flexDirection: 'row', gap: 9 },
  goAgain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  goAgainText: { fontSize: 13, fontWeight: '500' },
});
