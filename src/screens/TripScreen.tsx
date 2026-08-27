import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stayForDay } from '../domain/trip';
import type { CuratedPlace, Landmark } from '../domain/types';
import { formatTime, makeStartPlace } from '../lib/geo';
import { detachFromTrip, loadDayIntoPlanner } from '../lib/tripBridge';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { DATASET_CITY, encodeTripLink } from '../lib/tripLink';
import { useTripStore } from '../store/useTripStore';
import { useTripsStore } from '../store/useTripsStore';
import { colors, tint } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Trip'>;

/**
 * One trip: its days, each a card (PRD Phase 4; §266 "drag places onto
 * days" — moving is a tap-menu in this version, the way arrange mode
 * preceded the queue drag: structure first, gesture once it is proven).
 *
 * The card shows what the day IS — stay, window, places — and one action,
 * "Plan this day", which loads it into the planner. Ordering, pinning,
 * starting and stamping all happen there; this screen never duplicates a
 * planner control, because two editors for one day would disagree
 * eventually and one of them would be lying.
 */
export function TripScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const trip = useTripsStore((s) => s.trips.find((t) => t.id === route.params.id));
  const activeDay = useTripsStore((s) => s.activeDay);
  const addDay = useTripsStore((s) => s.addDay);
  const removeDay = useTripsStore((s) => s.removeDay);
  const deleteTrip = useTripsStore((s) => s.deleteTrip);
  const renameTrip = useTripsStore((s) => s.renameTrip);
  const setDayStay = useTripsStore((s) => s.setDayStay);
  const movePlaceBetweenDays = useTripsStore((s) => s.movePlaceBetweenDays);
  const removePlaceFromDay = useTripsStore((s) => s.removePlaceFromDay);
  const plannerSelection = useTripStore((s) => s.selectedPlaceIds);
  /**
   * The user's usual anchor, for the "your usual start" line on stay-less
   * days. While a trip day is open the planner's own `startPlace` is the
   * borrowed stay, not the user's — read it raw and Day 1 claimed Day 2's
   * hotel as "your usual start". The bridge's saved copy is the truth for
   * exactly as long as the borrow lasts.
   */
  const plannerStart = useTripStore((s) => s.startPlace);
  const savedPlanner = useTripsStore((s) => s.savedPlanner);
  const usualStart = savedPlanner ? savedPlanner.startPlace : plannerStart;

  /** Resolved once for names on chips; ids are meaningless on screen. */
  const [places, setPlaces] = useState<Map<string, CuratedPlace>>(new Map());
  useEffect(() => {
    placesService
      .listPlaces()
      .then((all) => setPlaces(new Map(all.map((p) => [p.id, p]))));
  }, []);

  /** Which day is choosing a stay, or null when the picker is closed. */
  const [stayPickerDay, setStayPickerDay] = useState<string | null>(null);

  const dayCount = trip?.days.length ?? 0;
  const dayLabel = useMemo(
    () => (i: number) => `Day ${i + 1}`,
    []
  );

  if (!trip) {
    // Deleted while open, or restored navigation pointing at a trip that no
    // longer exists. A sentence beats a crash.
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
          <Text style={styles.title}>Trip</Text>
        </View>
        <Text style={[styles.body, { padding: 16 }]}>
          This trip is gone. It may have been deleted.
        </Text>
      </View>
    );
  }

  const openDay = (index: number) => {
    const day = trip.days[index];
    const isActive = activeDay?.dayId === day.id;
    const load = () => {
      loadDayIntoPlanner(trip, index);
      navigation.navigate('Tabs', { screen: 'Plan' });
    };
    if (isActive) {
      navigation.navigate('Tabs', { screen: 'Plan' });
      return;
    }
    // The same courtesy the shared-link prompt pays: an ad-hoc day someone
    // was planning is about to be replaced, and they should say so first.
    // Switching between this trip's own days skips it — the day being
    // replaced is already saved on this screen.
    const replacingAdHoc = activeDay === null && plannerSelection.length > 0;
    if (replacingAdHoc) {
      Alert.alert(
        `Plan ${dayLabel(index)}?`,
        `This replaces the ${plannerSelection.length} place${
          plannerSelection.length === 1 ? '' : 's'
        } you have selected.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Plan it', onPress: load },
        ]
      );
    } else {
      load();
    }
  };

  const placeMenu = (dayId: string, placeId: string, name: string) => {
    const others = trip.days
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.id !== dayId);
    Alert.alert(name, undefined, [
      ...others.map(({ d, i }) => ({
        text: `Move to ${dayLabel(i)}`,
        onPress: () => movePlaceBetweenDays(trip.id, placeId, dayId, d.id),
      })),
      {
        text: 'Remove from trip',
        style: 'destructive' as const,
        onPress: () => removePlaceFromDay(trip.id, dayId, placeId),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmDeleteTrip = () =>
    Alert.alert(`Delete ${trip.name}?`, 'Its days are not kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Let go of the planner first, or the write-back's dangling
          // pointer cleanup does it less politely.
          if (activeDay?.tripId === trip.id) detachFromTrip();
          deleteTrip(trip.id);
          navigation.goBack();
        },
      },
    ]);

  /**
   * The trip as a link. Days travel with their places, windows, goals and
   * pins; stays never — the encoder has no field for one, and the message
   * says the receiver's days start from their own anchor. The order shared
   * is the order this screen shows: a hand-arranged day sends its
   * arrangement, an unarranged one sends the selection.
   */
  const shareTrip = async () => {
    const days = trip.days.filter((d) => d.placeIds.length > 0);
    if (days.length === 0) {
      Alert.alert('Nothing to share yet', 'Put some places on the days first.');
      return;
    }
    const link = encodeTripLink({
      city: DATASET_CITY,
      name: trip.name,
      days: days.map((d) => ({
        placeIds: d.dayOrder ?? d.placeIds,
        window: d.window,
        goal: d.goal,
        pinnedTimes: d.pinnedTimes,
      })),
    });
    const placeCount = days.reduce((n, d) => n + d.placeIds.length, 0);
    await Share.share({
      message: [
        `${trip.name} — ${days.length} day${days.length === 1 ? '' : 's'}, ${placeCount} place${placeCount === 1 ? '' : 's'} in the Bay Area.`,
        `Open in PIRT: ${link}`,
      ].join('\n\n'),
    });
  };

  const rename = () => {
    Alert.prompt?.(
      'Rename trip',
      undefined,
      (name) => name && renameTrip(trip.id, name),
      'plain-text',
      trip.name
    );
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
        <Pressable onPress={rename} style={styles.titleTap}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.name}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void shareTrip()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Share this trip as a link"
        >
          <MaterialCommunityIcons
            name="tray-arrow-up"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable onPress={confirmDeleteTrip} hitSlop={8}>
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={20}
            color={colors.textMuted}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        {trip.days.map((day, i) => {
          const stay = stayForDay(trip, i);
          const inherited = stay !== null && day.stay === null;
          const isActive = activeDay?.dayId === day.id;
          return (
            <View key={day.id} style={[styles.card, isActive && styles.cardActive]}>
              <View style={styles.cardHead}>
                <Text style={styles.dayTitle}>{dayLabel(i)}</Text>
                {isActive && (
                  <View style={styles.activeTag}>
                    <MaterialCommunityIcons
                      name="pencil-outline"
                      size={11}
                      color={colors.accent}
                    />
                    <Text style={styles.activeTagText}>in the Plan tab</Text>
                  </View>
                )}
                <View style={styles.spacer} />
                {dayCount > 1 && (
                  <Pressable
                    onPress={() =>
                      Alert.alert(`Remove ${dayLabel(i)}?`, undefined, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => removeDay(trip.id, day.id),
                        },
                      ])
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${dayLabel(i)} from the trip`}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={16}
                      color={colors.textMuted}
                    />
                  </Pressable>
                )}
              </View>

              {/*
                The stay line always says where the day actually starts —
                resolved, not raw — and says when that answer is borrowed.
                "From Day 1's stay" is a different fact from "you chose this
                for Day 3", and hiding the difference would make moving a
                stay feel like it broke days it never touched.
              */}
              <Pressable
                style={styles.stayRow}
                onPress={() => setStayPickerDay(day.id)}
                accessibilityRole="button"
                accessibilityLabel={`Choose where ${dayLabel(i)} starts`}
              >
                <MaterialCommunityIcons
                  name="bed-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={styles.stayText} numberOfLines={1}>
                  {stay
                    ? `${stay.name}${inherited ? ' · as the day before' : ''}`
                    : usualStart
                      ? `${usualStart.name} · your usual start`
                      : 'Choose a stay'}
                </Text>
                <Text style={styles.stayHours}>
                  {formatTime(day.window.dayStartMin)}–
                  {formatTime(day.window.homeByMin)}
                </Text>
              </Pressable>

              {/*
                The order the day is actually walked in, not the order the
                places were picked. `shareTrip` already resolves it this way
                and so does the planner; leaving the card on the raw
                selection made it contradict both — you arrange a day, come
                back here, and the card lists it the old way round.
              */}
              {day.placeIds.length === 0 ? (
                <Text style={styles.emptyDay}>
                  Nothing here yet — plan the day and pick places in Explore.
                </Text>
              ) : (
                <View style={styles.chips}>
                  {(day.dayOrder ?? day.placeIds).map((pid) => (
                    <Pressable
                      key={pid}
                      style={styles.chip}
                      onPress={() =>
                        placeMenu(day.id, pid, places.get(pid)?.name ?? pid)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${places.get(pid)?.name ?? 'Place'} — move or remove`}
                    >
                      <Text style={styles.chipText} numberOfLines={1}>
                        {places.get(pid)?.name ?? pid}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Pressable
                style={styles.planBtn}
                onPress={() => openDay(i)}
                accessibilityRole="button"
                accessibilityLabel={`Plan ${dayLabel(i)} in the Plan tab`}
              >
                <MaterialCommunityIcons
                  name={isActive ? 'arrow-right' : 'map-outline'}
                  size={15}
                  color={colors.accent}
                />
                <Text style={styles.planBtnText}>
                  {isActive ? 'Back to the plan' : 'Plan this day'}
                </Text>
              </Pressable>
            </View>
          );
        })}

        <Pressable
          style={styles.addDay}
          onPress={() => addDay(trip.id)}
          accessibilityRole="button"
          accessibilityLabel="Add a day to the trip"
        >
          <MaterialCommunityIcons name="plus" size={16} color={colors.textSecondary} />
          <Text style={styles.addDayText}>Add a day</Text>
        </Pressable>

        {activeDay?.tripId === trip.id && (
          <Pressable
            style={styles.detach}
            onPress={detachFromTrip}
            accessibilityRole="button"
            accessibilityLabel="Stop planning this trip and get your own day back"
          >
            <Text style={styles.detachText}>
              Done planning — give me my own day back
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <StayPicker
        visible={stayPickerDay !== null}
        onClose={() => setStayPickerDay(null)}
        onPick={(landmark) => {
          if (stayPickerDay) {
            setDayStay(trip.id, stayPickerDay, makeStartPlace(landmark));
          }
          setStayPickerDay(null);
        }}
        onClear={() => {
          if (stayPickerDay) setDayStay(trip.id, stayPickerDay, null);
          setStayPickerDay(null);
        }}
      />
    </View>
  );
}

/**
 * Choosing a stay, from the same landmark search Setup uses for the start
 * place — and only from it. That the picker cannot express an arbitrary
 * coordinate is what makes the store's §3.1 claim ("nothing ephemeral can
 * reach this store") true by construction rather than by discipline.
 */
function StayPicker({
  visible,
  onClose,
  onPick,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (l: Landmark) => void;
  onClear: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Landmark[]>([]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    placesService.searchLandmarks(query).then((r) => {
      if (alive) setResults(r.slice(0, 12));
    });
    return () => {
      alive = false;
    };
  }, [query, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <MaterialCommunityIcons
              name="close"
              size={22}
              color={colors.textSecondary}
            />
          </Pressable>
          <Text style={styles.title}>Where does this day start?</Text>
        </View>
        <View style={styles.pickerBody}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search stations and plazas"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <ScrollView contentContainerStyle={styles.pickerList}>
            <Pressable style={styles.pickerRow} onPress={onClear}>
              <MaterialCommunityIcons
                name="home-outline"
                size={18}
                color={colors.textSecondary}
              />
              <Text style={styles.pickerRowText}>
                Same as the day before / your usual start
              </Text>
            </Pressable>
            {results.map((l) => (
              <Pressable
                key={l.id}
                style={styles.pickerRow}
                onPress={() => onPick(l)}
              >
                <MaterialCommunityIcons
                  name="map-marker-outline"
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={styles.pickerRowText} numberOfLines={1}>
                  {l.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  titleTap: { flex: 1 },
  spacer: { flex: 1 },
  body: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  content: { padding: 16, gap: 12 },
  card: {
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    padding: 14,
    gap: 10,
  },
  cardActive: {
    backgroundColor: tint(colors.accent),
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  activeTagText: { fontSize: 11, fontWeight: '500', color: colors.accent },
  stayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stayText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  stayHours: { fontSize: 12, color: colors.textMuted },
  emptyDay: { fontSize: 13, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    maxWidth: '100%',
  },
  chipText: { fontSize: 13, color: colors.textPrimary },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.surface,
  },
  planBtnText: { fontSize: 13, fontWeight: '500', color: colors.accent },
  addDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
  },
  addDayText: { fontSize: 14, color: colors.textSecondary },
  detach: { alignItems: 'center', paddingVertical: 10 },
  detachText: { fontSize: 13, color: colors.textSecondary },
  pickerBody: { flex: 1, padding: 16, gap: 12 },
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceInput,
    fontSize: 14,
    color: colors.textPrimary,
  },
  pickerList: { gap: 4, paddingBottom: 24 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  pickerRowText: { flex: 1, fontSize: 14, color: colors.textPrimary },
});
