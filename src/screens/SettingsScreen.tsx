import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
import { appBuildMeta } from '../lib/appMeta';
import { formatReport } from '../lib/crashReport';
import { clearCrashLog, readCrashLog } from '../services/crashLog';
import { exportDiary, importDiary } from '../services/diaryBackup';
import { visibleMyPlaces, useMyPlacesStore } from '../store/useMyPlacesStore';
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
  const myPlaces = visibleMyPlaces(useMyPlacesStore((s) => s.places));
  const selectedIds = useTripStore((s) => s.selectedPlaceIds);
  const togglePlace = useTripStore((s) => s.togglePlace);
  const hideMyPlace = useMyPlacesStore((s) => s.hide);
  const [busy, setBusy] = useState(false);
  /**
   * How many problems are waiting to be sent. Counted on focus rather than
   * held in a store: it changes only when something goes wrong, and a crash
   * has better things to do than notify a settings screen.
   */
  const [crashes, setCrashes] = useState(0);
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      void readCrashLog().then((log) => {
        if (alive) setCrashes(log.length);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  /**
   * The whole of "crash reporting" in this app: the user hands it over.
   * Nothing is transmitted on its own — the share sheet is the only way out,
   * which is what lets the privacy page keep saying the app carries no
   * reporting SDK.
   */
  const onSendCrashes = async () => {
    const log = await readCrashLog();
    if (log.length === 0) return;
    await Share.share({ message: formatReport(log, appBuildMeta()) });
    // Cleared only after the sheet closes, and deliberately without asking:
    // a report kept after sending gets sent twice, and the second one reads
    // as a second crash.
    await clearCrashLog();
    setCrashes(0);
  };

  /**
   * Confirmed, because the row's action is one tap from its name and the
   * list is small enough that a mis-tap lands on the wrong place easily.
   */
  const onRemoveMyPlace = (id: string, name: string) => {
    Alert.alert(`Remove ${name}?`, 'It leaves Explore and planning. Anything you have stamped there keeps its name.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          // Taken out of the day as well as out of the list. The selection
          // is a list of ids, so a removed place would otherwise still be
          // counted — Explore offering to "Plan 4" a day with three stops.
          if (selectedIds.includes(id)) togglePlace(id);
          hideMyPlace(id);
        },
      },
    ]);
  };

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
        [
          `${report.added} added, ${report.skipped} already here` +
            (report.photosRestored > 0 ? `, ${report.photosRestored} photos` : ''),
          // Said out loud rather than absorbed. A restore that quietly
          // discarded rows would have the user believe they got everything
          // back, which is the worst moment to be wrong about.
          report.dropped > 0
            ? `${report.dropped} ${report.dropped === 1 ? 'entry' : 'entries'} in the file could not be read and ${report.dropped === 1 ? 'was' : 'were'} left out.`
            : null,
          report.repaired > 0
            ? `${report.repaired} had an answer we could not read, kept as "maybe".`
            : null,
        ]
          .filter(Boolean)
          .join('\n\n')
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

        {/*
          Its own group, above the diary rather than inside it, because it
          is the one thing here that leaves the phone. Putting a networked
          feature among the local ones would blur the line the rest of this
          screen exists to draw.
        */}
        <Text style={styles.groupLabel}>Planning with other people</Text>
        <View style={styles.card}>
          <Row
            icon="account-multiple-outline"
            label="Shared lists"
            onPress={() => navigation.navigate('Wishlists')}
          />
        </View>
        <Text style={styles.groupNote}>
          A shared list is the only thing PIRT keeps on a server, and only
          the people you invite can see it. Your diary is never uploaded.
        </Text>

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

        {/*
          Absent when nothing has gone wrong, rather than present and empty.
          A permanent "Problems: 0" invites people to go looking for trouble,
          and the row only means anything on the day it appears.
        */}
        {crashes > 0 && (
          <>
            <Text style={styles.groupLabel}>Problems</Text>
            <View style={styles.card}>
              <Row
                icon="alert-circle-outline"
                label="Send what went wrong"
                value={`${crashes}`}
                onPress={onSendCrashes}
              />
            </View>
            <Text style={styles.groupNote}>
              {crashes === 1 ? 'One problem was' : `${crashes} problems were`}{' '}
              recorded on this phone. Nothing is sent until you send it, and
              the report carries the error and the build only — never your
              diary.
            </Text>
          </>
        )}

        {/*
          Same rule as Problems: absent until there is something to manage.
          But present the moment there is, because a place added by mistake
          would otherwise be permanent — the form can add and nothing could
          take away.
        */}
        {myPlaces.length > 0 && (
          <>
            <Text style={styles.groupLabel}>Your own places</Text>
            <View style={styles.card}>
              {myPlaces.map((p, i) => (
                <Row
                  key={p.id}
                  icon="map-marker-outline"
                  label={p.name}
                  value="Remove"
                  onPress={() => onRemoveMyPlace(p.id, p.name)}
                  divided={i < myPlaces.length - 1}
                />
              ))}
            </View>
            <Text style={styles.groupNote}>
              Places you added yourself. They live on this phone and are not
              sent anywhere. Removing one takes it out of Explore and planning;
              days you have already stamped against it keep its name.
            </Text>
          </>
        )}

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
