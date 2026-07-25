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

        {here ? (
          <Pressable
            style={({ pressed }) => [styles.hereRow, pressed && styles.rowPressed]}
            onPress={startFromHere}
          >
            <View style={styles.hereIcon}>
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={17}
                color={colors.positive}
              />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowName}>Start from where I am</Text>
              <Text style={styles.rowKind}>Used for this plan only, never saved</Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.locBtn, pressed && styles.rowPressed]}
            onPress={useMyLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={16}
                color={colors.textSecondary}
              />
            )}
            <Text style={styles.locBtnText}>
              {locating ? 'Finding you…' : 'Find landmarks near me'}
            </Text>
          </Pressable>
        )}
        {locError && <Text style={styles.locError}>{locError}</Text>}
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
  /** Secondary button (ui-guide §5) — landmark-first stays the emphasis, so
   *  the GPS affordance is deliberately not the clay primary. */
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  locBtnText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  hereRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.positive,
    backgroundColor: colors.selectedWell,
  },
  hereIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locError: {
    fontSize: 11,
    color: colors.warning,
    marginTop: 8,
    textAlign: 'center',
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
