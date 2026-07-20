import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { landmarkIcon } from '../components/icons';
import type { Landmark } from '../domain/types';
import { makeStartPlace } from '../lib/geo';
import type { RootStackParamList } from '../navigation';
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

  useEffect(() => {
    let alive = true;
    placesService.searchLandmarks(query).then((r) => {
      if (alive) setResults(r);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  const choose = (lm: Landmark) => {
    setStartPlace(makeStartPlace(lm));
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Tabs');
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
      </View>
      <FlatList
        data={results}
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
