import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalErrorHandler } from './src/services/crashLog';
import { useSharedDayLink } from './src/hooks/useSharedDayLink';
import { TabBar } from './src/components/TabBar';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { AddPlaceScreen } from './src/screens/AddPlaceScreen';
import { DiaryScreen } from './src/screens/DiaryScreen';
import { EditVisitScreen } from './src/screens/EditVisitScreen';
import { MemoriesScreen } from './src/screens/MemoriesScreen';
import { PlacesScreen } from './src/screens/PlacesScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { PlanSuggestScreen } from './src/screens/PlanSuggestScreen';
import { useAuthStore } from './src/store/useAuthStore';
import { CostSplitScreen } from './src/screens/CostSplitScreen';
import { WishlistScreen } from './src/screens/WishlistScreen';
import { WishlistsScreen } from './src/screens/WishlistsScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { StartDayScreen } from './src/screens/StartDayScreen';
import { StampScreen } from './src/screens/StampScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useDiaryStore } from './src/store/useDiaryStore';
import { useTripStore } from './src/store/useTripStore';
import { colors } from './src/theme/colors';

/*
  At module scope, not in an effect: an error thrown while the first screen
  mounts happens before any effect runs, and those are the ones worth having.
*/
installGlobalErrorHandler();

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Memories" component={MemoriesScreen} />
      <Tab.Screen name="Explore" component={PlacesScreen} />
      <Tab.Screen name="Plan" component={PlanSuggestScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

/**
 * Wait for AsyncStorage rehydration before deciding the initial screen.
 * Both stores must land: showing an empty memory wall to someone with a
 * diary would read as data loss, which is the worst possible first frame.
 */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(
    useTripStore.persist.hasHydrated() && useDiaryStore.persist.hasHydrated()
  );
  useEffect(() => {
    const check = () =>
      setHydrated(
        useTripStore.persist.hasHydrated() && useDiaryStore.persist.hasHydrated()
      );
    const unsubTrip = useTripStore.persist.onFinishHydration(check);
    const unsubDiary = useDiaryStore.persist.onFinishHydration(check);
    return () => {
      unsubTrip();
      unsubDiary();
    };
  }, []);
  return hydrated;
}

export default function App() {
  const hydrated = useHydrated();
  const hasStartPlace = useTripStore((s) => s.startPlace !== null);

  /*
    Above the splash return, because hooks cannot be conditional and because
    a link that arrives during a cold start arrives *now* — before the first
    frame. The hook waits for the store itself rather than for this screen.
  */
  useSharedDayLink();

  /*
   * Starts the session listener once, at the root, rather than when the
   * wishlist screen happens to open. A session that only wakes up on one
   * screen is a session that expires unnoticed everywhere else.
   *
   * Does nothing at all in a build with no server configured.
   */
  useEffect(() => {
    useAuthStore.getState().init();
  }, []);

  if (!hydrated) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashBrand}>PIRT</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
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
            <Stack.Screen name="StartDay" component={StartDayScreen} />
            <Stack.Screen name="Stamp" component={StampScreen} />
            <Stack.Screen name="AddPlace" component={AddPlaceScreen} />
            <Stack.Screen name="CostSplit" component={CostSplitScreen} />
            <Stack.Screen name="Wishlists" component={WishlistsScreen} />
            <Stack.Screen name="Wishlist" component={WishlistScreen} />
            <Stack.Screen name="Privacy" component={PrivacyScreen} />
            <Stack.Screen name="Diary" component={DiaryScreen} />
            <Stack.Screen name="EditVisit" component={EditVisitScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        </SafeAreaProvider>
      </ErrorBoundary>
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
