import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavHeader } from '../components/NavHeader';
import type { RootStackParamList } from '../navigation';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Settings, split out of the profile (which is now the IG-style profile).
 * Start place, offline maps (Phase 4), and the privacy note live here. No
 * clay — settings are neutral.
 */
export function SettingsScreen({ navigation }: Props) {
  const startPlace = useTripStore((s) => s.startPlace);
  const [offlineMaps, setOfflineMaps] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Your day</Text>
        <View style={styles.group}>
          <Row
            icon="home"
            iconColor={colors.accent}
            label="Start place"
            value={startPlace ? startPlace.name : 'Not set'}
            onPress={() => navigation.navigate('Setup')}
          />
        </View>

        <Text style={styles.sectionLabel}>App</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="map-outline" size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Offline maps</Text>
              <Text style={styles.rowValue}>Download your city for the trip</Text>
            </View>
            <Switch
              value={offlineMaps}
              onValueChange={setOfflineMaps}
              trackColor={{ true: colors.positive, false: colors.borderStrong }}
            />
          </View>
        </View>

        <Text style={styles.privacy}>
          Start places are stored at block-level (~100 m) precision — never your
          exact address.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  iconColor,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  iconColor?: string;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor ?? colors.textSecondary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  sectionLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, paddingTop: 18, paddingBottom: 10 },
  group: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  pressed: { backgroundColor: colors.surfaceAlt },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  rowValue: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  privacy: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 22,
    textAlign: 'center',
    lineHeight: 16,
  },
});
