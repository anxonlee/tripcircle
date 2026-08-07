import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TAB_META: Record<string, { icon: IconName; label: string }> = {
  Memories: { icon: 'view-dashboard-outline', label: 'Diary' },
  Explore: { icon: 'map-search-outline', label: 'Explore' },
  Plan: { icon: 'routes', label: 'Plan' },
  Settings: { icon: 'cog-outline', label: 'Settings' },
};

/**
 * Bottom tab bar per ui-guide §4 (white, 56px, 0.5px top border, positive
 * active / muted inactive, micro labels) with a raised clay center button —
 * the Plan day primary action, so clay stays singular on every tab screen.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const renderTab = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    const meta = TAB_META[route.name];
    const active = state.index === routeIndex;
    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!active && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }}
      >
        <MaterialCommunityIcons
          name={meta.icon}
          size={22}
          color={active ? colors.positive : colors.textMuted}
        />
        <Text style={[styles.label, active && styles.labelActive]}>{meta.label}</Text>
      </Pressable>
    );
  };

  // Center button splits the tabs into two halves. Rendered from the live
  // route list rather than fixed indices, so the bar stays correct while the
  // Phase 1 tabs (Wall, Summary) are still being added.
  const split = Math.ceil(state.routes.length / 2);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.slice(0, split).map((_, i) => renderTab(i))}
      <View style={styles.tab}>
        <Pressable
          style={({ pressed }) => [styles.center, pressed && styles.centerPressed]}
          onPress={() => navigation.navigate('Stamp' as never)}
        >
          <MaterialCommunityIcons name="plus" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
      {state.routes.slice(split).map((_, i) => renderTab(split + i))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderStrong,
  },
  tab: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: { fontSize: 10, fontWeight: '400', color: colors.textMuted },
  labelActive: { color: colors.positive, fontWeight: '500' },
  center: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  centerPressed: { opacity: 0.85 },
});
