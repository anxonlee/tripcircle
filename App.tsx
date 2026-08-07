import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { PlacesScreen } from './src/screens/PlacesScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { useTripStore } from './src/store/useTripStore';
import { colors } from './src/theme/colors';

/**
 * INTERIM SHELL — mid-port.
 *
 * The Phase 2–4 tabs (Discover, Trips, Profile) moved to `src/_legacy` when
 * the MVP was resequenced around the place diary, and the Phase 1 tabs that
 * replace them — Memories, Explore, Plan, Settings — are still being ported.
 * Until they land this is a plain stack over the three screens that exist, so
 * the app runs and the type-check stays honest. `src/navigation.ts` already
 * declares the target routes.
 */
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

/** One tab for now; the custom five-slot bar returns with the other three. */
function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Explore" component={PlacesScreen} />
    </Tab.Navigator>
  );
}

/** Wait for AsyncStorage rehydration before deciding the initial screen. */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useTripStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useTripStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);
  return hydrated;
}

export default function App() {
  const hydrated = useHydrated();
  const hasStartPlace = useTripStore((s) => s.startPlace !== null);

  if (!hydrated) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashBrand}>TripCircle</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName={hasStartPlace ? 'Tabs' : 'Setup'}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Setup" component={SetupScreen} />
            <Stack.Screen name="DayPlan" component={PlanScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBrand: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
});
