import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Category, CuratedPlace, LatLng, PriceBand } from '../domain/types';
import { formatTime } from '../lib/geo';
import {
  type DraftHours,
  type MyPlaceDraft,
  STAY_LENGTHS,
  type StayLength,
  districtFor,
  draftProblems,
  draftToPlace,
  findDuplicate,
  newMyPlaceId,
} from '../lib/myPlace';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { useMyPlacesStore } from '../store/useMyPlacesStore';
import { useTripStore } from '../store/useTripStore';
import { categoryColors, categoryLabels, colors } from '../theme/colors';

const THEMES: Category[] = [
  'food',
  'cafe',
  'historical',
  'shopping',
  'nature',
  'nightlife',
];

const BANDS: PriceBand[] = ['free', '$', '$$', '$$$'];

/** How far one tap moves an opening time. */
const STEP_MIN = 30;

/**
 * Add a place of your own.
 *
 * The dataset will never hold every corner café, and until now the app's
 * answer to a missing one was that you could not plan around it. This adds
 * one to your own device only — it is not a submission, nothing is uploaded,
 * and nobody else will see it.
 *
 * The form asks four questions and infers the rest, because `CuratedPlace`
 * wants ten fields and nobody will fill in ten fields for a café. What it
 * cannot ask about, it defaults conservatively and marks as inferred; see
 * lib/myPlace.ts, where those decisions live and are tested.
 */
export function AddPlaceScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AddPlace'>) {
  const insets = useSafeAreaInsets();
  const startPlace = useTripStore((s) => s.startPlace);
  const addPlace = useMyPlacesStore((s) => s.add);

  const [name, setName] = useState('');
  const [theme, setTheme] = useState<Category>('cafe');
  const [stay, setStay] = useState<StayLength>('visit');
  const [priceBand, setPriceBand] = useState<PriceBand>('$');
  const [hours, setHours] = useState<DraftHours>({ kind: 'unknown' });
  const [pin, setPin] = useState<LatLng | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  /**
   * The whole catalogue, for two jobs: naming the district from the nearest
   * known place, and spotting that this café is already here. Loaded once —
   * neither job is worth blocking the form on.
   */
  const [known, setKnown] = useState<CuratedPlace[]>([]);
  useEffect(() => {
    placesService.listPlaces().then(setKnown);
  }, []);

  /**
   * Opens where the day starts, since that is where the user is most likely
   * standing when they think to add somewhere. The pin is not placed until
   * they place it: a marker sitting on the start place by default would get
   * saved unexamined, and a place at the wrong coordinates is worse than one
   * that was never added.
   */
  const region = useMemo(
    () => ({
      latitude: startPlace?.location.latitude ?? 37.772,
      longitude: startPlace?.location.longitude ?? -122.437,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    }),
    [startPlace]
  );
  const mapRef = useRef<MapView>(null);

  const draft: Partial<MyPlaceDraft> = {
    name,
    location: pin ?? undefined,
    theme,
    stay,
    priceBand,
    hours,
  };
  const problems = draftProblems(draft);
  const duplicate = pin ? findDuplicate({ name, location: pin }, known) : null;

  const nudge = (field: 'open' | 'close', by: number) => {
    setHours((h) => {
      if (h.kind !== 'window') return h;
      const next = { ...h, [field]: h[field] + by };
      // Kept apart by a step so the pair can never cross; the validator
      // would catch it, but a control that produces an error is a bad
      // control when it could simply refuse to.
      if (next.close - next.open < STEP_MIN) return h;
      if (next.open < 0 || next.close > 1560) return h;
      return next;
    });
  };

  const save = () => {
    if (problems.length > 0 || !pin) {
      setShowProblems(true);
      return;
    }
    const now = Date.now();
    const place = draftToPlace(
      { name, location: pin, theme, stay, priceBand, hours },
      districtFor(pin, known),
      newMyPlaceId(now, Math.random()),
      now
    );
    addPlace(place);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back, without adding the place"
          style={styles.back}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={26}
            color={colors.textPrimary}
          />
        </Pressable>
        <Text style={styles.title}>Add a place</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Somewhere the app does not know about. It stays on this phone — it is
          not sent anywhere and nobody else sees it.
        </Text>

        <Text style={styles.label}>What is it called?</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="The corner café"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
          returnKeyType="done"
        />
        {showProblems && problems.includes('no-name') ? (
          <Text style={styles.problem}>It needs a name.</Text>
        ) : null}
        {showProblems && problems.includes('name-too-long') ? (
          <Text style={styles.problem}>That name is too long to fit a card.</Text>
        ) : null}
        {duplicate ? (
          <Text style={styles.note}>
            {duplicate.name} is already here, a few steps away. Adding this
            makes a second copy.
          </Text>
        ) : null}

        <Text style={styles.label}>Where is it?</Text>
        <Text style={styles.hint}>Tap the map to drop a pin, or drag it.</Text>
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={region}
            onPress={(e) => setPin(e.nativeEvent.coordinate)}
          >
            {pin ? (
              <Marker
                coordinate={pin}
                draggable
                onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
                pinColor={categoryColors[theme]}
              />
            ) : null}
          </MapView>
        </View>
        {showProblems && problems.includes('no-location') ? (
          <Text style={styles.problem}>Drop a pin so the day can route to it.</Text>
        ) : null}

        <Text style={styles.label}>What kind of place?</Text>
        <View style={styles.chips}>
          {THEMES.map((t) => (
            <Chip
              key={t}
              label={categoryLabels[t]}
              active={theme === t}
              tint={categoryColors[t]}
              onPress={() => setTheme(t)}
            />
          ))}
        </View>

        <Text style={styles.label}>How long would you stay?</Text>
        <View style={styles.chips}>
          {STAY_LENGTHS.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              active={stay === s.id}
              onPress={() => setStay(s.id)}
            />
          ))}
        </View>

        <Text style={styles.label}>Roughly what does it cost?</Text>
        <View style={styles.chips}>
          {BANDS.map((b) => (
            <Chip
              key={b}
              label={b === 'free' ? 'Free' : b}
              active={priceBand === b}
              onPress={() => setPriceBand(b)}
            />
          ))}
        </View>

        <Text style={styles.label}>When is it open?</Text>
        <View style={styles.chips}>
          <Chip
            label="Not sure"
            active={hours.kind === 'unknown'}
            onPress={() => setHours({ kind: 'unknown' })}
          />
          <Chip
            label="Always open"
            active={hours.kind === 'always'}
            onPress={() => setHours({ kind: 'always' })}
          />
          <Chip
            label="Set the times"
            active={hours.kind === 'window'}
            onPress={() =>
              setHours((h) =>
                h.kind === 'window' ? h : { kind: 'window', open: 540, close: 1080 }
              )
            }
          />
        </View>

        {hours.kind === 'unknown' ? (
          <Text style={styles.note}>
            The day will assume {formatTime(540)} to {formatTime(1080)} and show
            the place as a guess, so nothing pretends to know hours it does not.
          </Text>
        ) : null}

        {hours.kind === 'window' ? (
          <View style={styles.stepperGroup}>
            <Stepper
              label="Opens"
              value={hours.open}
              onLess={() => nudge('open', -STEP_MIN)}
              onMore={() => nudge('open', STEP_MIN)}
            />
            <Stepper
              label="Closes"
              value={hours.close}
              onLess={() => nudge('close', -STEP_MIN)}
              onMore={() => nudge('close', STEP_MIN)}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable style={styles.save} onPress={save} accessibilityRole="button">
          <Text style={styles.saveText}>Add to my places</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({
  label,
  active,
  tint,
  onPress,
}: {
  label: string;
  active: boolean;
  tint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        active && styles.chipActive,
        active && tint ? { borderColor: tint } : null,
      ]}
    >
      {tint ? <View style={[styles.dot, { backgroundColor: tint }]} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onLess,
  onMore,
}: {
  label: string;
  value: number;
  onLess: () => void;
  onMore: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable
        onPress={onLess}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${label} earlier`}
        style={styles.stepBtn}
      >
        <MaterialCommunityIcons name="minus" size={16} color={colors.textSecondary} />
      </Pressable>
      <Text style={styles.stepperValue}>{formatTime(value)}</Text>
      <Pressable
        onPress={onMore}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${label} later`}
        style={styles.stepBtn}
      >
        <MaterialCommunityIcons name="plus" size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  back: { marginLeft: -7, marginRight: 1, width: 30, height: 30, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
  body: { paddingHorizontal: 16, gap: 8 },
  lead: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 14,
  },
  hint: { fontSize: 12, color: colors.textMuted },
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceInput,
    fontSize: 15,
    color: colors.textPrimary,
  },
  problem: { fontSize: 12, color: colors.accent },
  note: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  mapWrap: {
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.selectedWell, borderColor: colors.positive },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stepperGroup: { gap: 8, marginTop: 4 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceInput,
  },
  stepperLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  stepperValue: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, minWidth: 52, textAlign: 'center' },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  save: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
