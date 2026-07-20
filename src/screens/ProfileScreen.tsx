import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList, TabParamList } from '../navigation';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Settings-lite: the start place lives here. Accounts arrive post-MVP. */
export function ProfileScreen({ navigation }: Props) {
  const startPlace = useTripStore((s) => s.startPlace);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => navigation.navigate('Setup')}
      >
        <View style={styles.rowIcon}>
          <MaterialCommunityIcons name="home" size={18} color={colors.accent} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowLabel}>Start place</Text>
          <Text style={styles.rowValue}>
            {startPlace ? startPlace.name : 'Not set'}
          </Text>
        </View>
        <Text style={styles.rowAction}>Change</Text>
      </Pressable>
      <Text style={styles.privacy}>
        Start places are stored at block-level (~100 m) precision — never your
        exact address.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
  row: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.textMuted },
  rowValue: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, marginTop: 1 },
  rowAction: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  privacy: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: 32,
    paddingTop: 20,
    textAlign: 'center',
    lineHeight: 16,
  },
});
