import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { landmarkIcon } from '../components/icons';
import type { Landmark, LatLng } from '../domain/types';
import { haversineKm, makeStartPlace } from '../lib/geo';
import type { RootStackParamList } from '../navigation';
import { locationService } from '../services/location';
import { placesService } from '../services/places';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

const KIND_LABEL: Record<Landmark['kind'], string> = {
  station: 'Station',
  plaza: 'Plaza',
  park: 'Park',
  landmark: 'Landmark',
};

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

/**
 * Start-place setup — landmark-first (PRD §3.1). Suggests public landmarks;
 * never asks for a home address. The chosen landmark is coarse-snapped
 * (~100 m) by makeStartPlace before it touches the store.
 */
export function SetupScreen({ navigation }: Props) {
  const setStartPlace = useTripStore((s) => s.setStartPlace);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Landmark[]>([]);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    placesService.searchLandmarks(query).then((r) => {
      if (alive) setResults(r);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  /** Once we know where the user is, landmarks sort nearest-first. */
  const ordered = useMemo(() => {
    if (!here) return results;
    return [...results].sort(
      (a, b) => haversineKm(here, a.location) - haversineKm(here, b.location)
    );
  }, [results, here]);

  const done = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Tabs');
  };

  const choose = (lm: Landmark) => {
    setStartPlace(makeStartPlace(lm));
    done();
  };

  const useMyLocation = async () => {
    setLocating(true);
    setLocError(null);
    const res = await locationService.getCurrentCoarse();
    setLocating(false);
    if (res.status === 'ok') setHere(res.coords);
    else if (res.status === 'denied')
      setLocError('Location is off for TripCircle. Pick a landmark instead.');
    else setLocError('Could not get a location. Pick a landmark instead.');
  };

  /** PRD §3.1 ephemeral mode: usable as an anchor, never written to storage. */
  const startFromHere = () => {
    if (!here) return;
    setStartPlace(
      {
        id: 'ephemeral-current',
        name: 'Current location',
        kind: 'landmark',
        location: here,
      },
      { ephemeral: true }
    );
    done();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Where does your day start?</Text>
        <Text style={styles.subtitle}>
          Pick a public landmark near you — a station or a plaza. TripCircle
          never asks for your exact address.
        </Text>
        <View style={styles.inputWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search stations and plazas"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/**
         * One control, three states, never replaced by a differently-named
         * one. The previous version swapped "Find landmarks near me" for
         * "Start from where I am" — two different actions sharing a slot,
         * where tapping the first was the only way to discover the second
         * existed, and the second did something the first did not.
         *
         * Now the row keeps its position and its meaning: it is always the
         * location control. What changes is what it can do once it knows
         * where you are.
         */}
        <Pressable
          style={({ pressed }) => [
            styles.locCard,
            here && styles.locCardReady,
            pressed && styles.rowPressed,
          ]}
          onPress={here ? startFromHere : useMyLocation}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel={
            here
              ? 'Start from where I am. Used for this plan only, never saved.'
              : 'Use my current location to sort landmarks by distance'
          }
        >
          <View style={[styles.locIcon, here && styles.locIconReady]}>
            {locating ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={17}
                color={here ? colors.positive : colors.textSecondary}
              />
            )}
          </View>
          <View style={styles.rowText}>
            <Text style={styles.locTitle}>
              {locating
                ? 'Finding you…'
                : here
                  ? 'Start from where I am'
                  : 'Use my current location'}
            </Text>
            <Text style={styles.locCaption}>
              {locating
                ? 'Taking a single reading'
                : here
                  ? 'Used for this plan only, never saved'
                  : 'Sorts the landmarks below by distance'}
            </Text>
          </View>
          {!locating && (
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.textMuted}
            />
          )}
        </Pressable>

        {/**
         * The error belongs to the control that failed, so it sits attached
         * to it rather than floating under the card, and it offers the retry
         * rather than leaving the user to guess that tapping again is allowed.
         */}
        {locError && (
          <View style={styles.locErrorRow}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={14}
              color={colors.warning}
            />
            <Text style={styles.locError}>{locError}</Text>
            <Pressable onPress={useMyLocation} hitSlop={8}>
              <Text style={styles.locRetry}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
      <FlatList
        data={ordered}
        keyExtractor={(lm) => lm.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => choose(item)}
          >
            <View style={styles.glyph}>
              <MaterialCommunityIcons
                name={landmarkIcon[item.kind]}
                size={18}
                color={colors.textSecondary}
              />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowKind}>{KIND_LABEL[item.kind]}</Text>
            </View>
            {here && (
              <Text style={styles.rowDistance}>
                {haversineKm(here, item.location).toFixed(1)} km
              </Text>
            )}
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        )}
        /**
         * Makes the re-sort visible. Locating quietly reorders the list, and
         * without a header the only evidence is that distances appeared —
         * which the user has to notice and interpret.
         */
        ListHeaderComponent={
          ordered.length > 0 ? (
            <Text style={styles.listHeader}>
              {here ? 'Nearest to you first' : 'Landmarks'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No landmarks match “{query}”</Text>
        }
        ListFooterComponent={
          <Text style={styles.privacy}>
            Start places are stored at block-level (~100 m) precision — never
            your exact address.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 16,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceInput,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  rowKind: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  rowDistance: { fontSize: 12, color: colors.textMuted },
  /**
   * The location control (ui-guide §5). One card in one position, whatever
   * state it is in — only its border and icon tint shift once it has a
   * reading, so the change reads as "this now knows something" rather than
   * as a different control appearing. Deliberately not the clay primary:
   * landmark-first stays the emphasis.
   */
  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  locCardReady: {
    borderColor: colors.positive,
    backgroundColor: colors.selectedWell,
  },
  locIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locIconReady: { backgroundColor: colors.surface },
  locTitle: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  locCaption: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  locErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  locError: {
    flex: 1,
    fontSize: 11,
    color: colors.warning,
    lineHeight: 15,
  },
  locRetry: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  listHeader: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 32,
    fontSize: 13,
  },
  privacy: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    lineHeight: 16,
  },
});
