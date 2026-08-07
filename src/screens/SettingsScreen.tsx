import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { File } from 'expo-file-system';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SuggestionBias } from '../lib/planner';
import type { RootStackParamList, TabParamList } from '../navigation';
import { exportDiary, importDiary } from '../services/diaryBackup';
import { useDiaryStore } from '../store/useDiaryStore';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type SettingsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Settings'>,
  NativeStackNavigationProp<RootStackParamList>
>;

/**
 * The two suggestion modes.
 *
 * There is no middle option. One was built and removed: an evenly weighted
 * ranking produced output identical to the familiar one at every diary size
 * measured, so it would have been a control position that did nothing.
 */
const BIAS_OPTIONS: { value: SuggestionBias; label: string; note: string }[] = [
  {
    value: 'familiar',
    label: 'Places you know',
    note: 'Leads with somewhere you liked and have not been in a while.',
  },
  {
    value: 'new',
    label: 'Somewhere fresh',
    note: 'Leads with places you have not stamped yet.',
  },
];

/**
 * Settings, in the slot the weekly summary used to occupy in the tab bar.
 *
 * The rows below the preference were at the bottom of the summary screen,
 * where a weekly recap had a backup tool and a privacy note bolted to it.
 * They are settings and now live with the settings.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<SettingsNavigation>();
  const startPlace = useTripStore((s) => s.startPlace);
  const suggestionBias = useTripStore((s) => s.suggestionBias);
  const setSuggestionBias = useTripStore((s) => s.setSuggestionBias);
  const visits = useDiaryStore((s) => s.visits);
  const replaceVisits = useDiaryStore((s) => s.replaceVisits);
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const uri = await exportDiary(visits);
      // The share sheet is the handoff: the file only leaves the device if
      // the user picks somewhere to send it.
      await Share.share({ url: uri });
    } catch (e) {
      Alert.alert('Backup failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
    if (picked.canceled || !picked.result) return;
    setBusy(true);
    try {
      const { visits: merged, summary: report } = await importDiary(
        picked.result.uri,
        visits
      );
      replaceVisits(merged);
      Alert.alert(
        'Diary restored',
        `${report.added} added, ${report.skipped} already here` +
          (report.photosRestored > 0 ? `, ${report.photosRestored} photos` : '')
      );
    } catch (e) {
      Alert.alert('Restore failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.groupLabel}>Suggestions</Text>
        <View style={styles.card}>
          {BIAS_OPTIONS.map((o, i) => (
            <Pressable
              key={o.value}
              onPress={() => setSuggestionBias(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: suggestionBias === o.value }}
              style={[styles.choice, i > 0 && styles.divided]}
            >
              <MaterialCommunityIcons
                name={
                  suggestionBias === o.value
                    ? 'radiobox-marked'
                    : 'radiobox-blank'
                }
                size={19}
                color={
                  suggestionBias === o.value ? colors.accent : colors.textMuted
                }
              />
              <View style={styles.choiceBody}>
                <Text style={styles.choiceLabel}>{o.label}</Text>
                <Text style={styles.choiceNote}>{o.note}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={styles.groupNote}>
          Only affects days the Plan tab suggests. Places you choose yourself
          are never reordered by this.
        </Text>

        <Text style={styles.groupLabel}>Your day</Text>
        <View style={styles.card}>
          <Row
            icon="map-marker-outline"
            label="Start place"
            value={startPlace ? startPlace.name : 'Not set'}
            onPress={() => navigation.navigate('Setup')}
          />
        </View>

        <Text style={styles.groupLabel}>Your diary</Text>
        <View style={styles.card}>
          <Row
            icon="format-list-bulleted"
            label="All visits"
            value={`${visits.length}`}
            onPress={() => navigation.navigate('Diary')}
          />
          <Row
            icon="tray-arrow-up"
            label="Back up"
            onPress={onExport}
            disabled={busy || visits.length === 0}
            divided
          />
          <Row
            icon="tray-arrow-down"
            label="Restore"
            onPress={onImport}
            disabled={busy}
            divided
          />
        </View>
        <Text style={styles.groupNote}>
          Saved on this device only. Until accounts arrive, a file you keep is
          the only thing between you and losing the diary with the app.
        </Text>

        <Text style={styles.groupLabel}>Privacy</Text>
        <View style={styles.card}>
          <Row
            icon="lock-outline"
            label="What stays on this phone"
            onPress={() => navigation.navigate('Privacy')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  disabled,
  divided,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  disabled?: boolean;
  divided?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.row, divided && styles.divided, disabled && styles.rowOff]}
    >
      <MaterialCommunityIcons name={icon} size={17} color={colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
      <MaterialCommunityIcons
        name="chevron-right"
        size={17}
        color={colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  content: { padding: 16, paddingBottom: 40, gap: 6 },
  groupLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 12,
    marginLeft: 2,
  },
  groupNote: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginLeft: 2,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    overflow: 'hidden',
  },
  divided: { borderTopWidth: 0.5, borderTopColor: colors.borderStrong },
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 13,
  },
  choiceBody: { flex: 1, gap: 2 },
  choiceLabel: { fontSize: 14, color: colors.textPrimary },
  choiceNote: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 13,
  },
  rowOff: { opacity: 0.4 },
  rowLabel: { flex: 1, fontSize: 14, color: colors.textPrimary },
  rowValue: { fontSize: 13, color: colors.textMuted },
});
