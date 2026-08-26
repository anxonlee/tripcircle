import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayOutBanner } from './src/components/DayOutBanner';
import { restorableState, type SavedNav } from './src/lib/navState';
import { useAuthStore } from './src/store/useAuthStore';
import { CostSplitScreen } from './src/screens/CostSplitScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { PostScreen } from './src/screens/PostScreen';
import { PublishDayScreen } from './src/screens/PublishDayScreen';
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

/**
 * The Plan tab is the plan, once there is one.
 *
 * It used to be the suggestion screen always, so anyone who had already
 * chosen their places had to walk through it to reach the day they had
 * built — every time they came back to the tab. The suggestion screen is
 * for people with nothing chosen yet; that is the only time it is the
 * answer to "Plan".
 *
 * Both are the same tab rather than a redirect, so there is no frame of the
 * wrong screen and no entry pushed onto the history to back out of.
 */
function PlanTab() {
  const hasDay = useTripStore((s) => s.selectedPlaceIds.length > 0);
  return hasDay ? <PlanScreen /> : <PlanSuggestScreen />;
}

function Tabs() {
  return (
    <View style={styles.root}>
      {/*
        Above the tabs, so it is on every screen a running day can be
        wandered away from — and outside the navigator, so switching tabs
        does not re-animate it.
      */}
      <DayOutBanner />
      <Tab.Navigator
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Memories" component={MemoriesScreen} />
        <Tab.Screen name="Explore" component={PlacesScreen} />
        <Tab.Screen name="Plan" component={PlanTab} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </View>
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

/**
 * Where the last screen was, so a hand-off to Google Maps does not cost the
 * user their place.
 *
 * Kept beside the diary in AsyncStorage rather than in the trip store: it
 * describes the app's chrome, not the user's day, and it should never end up
 * in a diary backup.
 */
const NAV_STATE_KEY = 'pirt-nav-state';

export default function App() {
  const hydrated = useHydrated();
  const hasStartPlace = useTripStore((s) => s.startPlace !== null);

  /**
   * Read once, at launch. `undefined` means "still looking", `null` means
   * "nothing worth restoring" — the two must not be confused, or the
   * navigator mounts before the answer arrives and lands on the default.
   */
  const [savedNav, setSavedNav] = useState<SavedNav | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(NAV_STATE_KEY)
      .then((raw) => {
        if (!alive) return;
        setSavedNav(raw ? (JSON.parse(raw) as SavedNav) : null);
      })
      // A position that cannot be read is not worth a failed launch. The
      // app opens where it always did.
      .catch(() => alive && setSavedNav(null));
    return () => {
      alive = false;
    };
  }, []);

  /*
    Above the splash return, because hooks cannot be conditional and because
    a link that arrives during a cold start arrives *now* — before the first
    frame. The hook waits for the store itself rather than for this screen.
  */
  useSharedDayLink();

  /*
   * An untouched day window starts at "not before now", and coming back to
   * the app hours later is exactly when that has gone stale — the plan on
   * screen would still be offering the morning you last opened it.
   *
   * On foreground rather than on a timer: a start time creeping forward
   * while the plan is being read would re-solve the day under the user's
   * thumb. Does nothing once the user has set a window of their own.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') useTripStore.getState().refreshDayStart();
    });
    return () => sub.remove();
  }, []);

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

  if (!hydrated || savedNav === undefined) {
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
        <NavigationContainer
          /*
           * Only ever a state that passed `restorableState`, which refuses
           * anything stale, anything malformed, and anything at all when
           * there is no anchor — that last one matters, because a restored
           * state overrides initialRouteName, and overriding it without an
           * anchor would drop somebody onto a plan that cannot be computed.
           */
          initialState={
            restorableState(savedNav, Date.now(), { hasStartPlace }) ?? undefined
          }
          onStateChange={(state) => {
            void AsyncStorage.setItem(
              NAV_STATE_KEY,
              JSON.stringify({ at: Date.now(), state } satisfies SavedNav)
            ).catch(() => {
              // Losing the bookmark costs a tap. It is not worth an error.
            });
          }}
        >
          <Stack.Navigator
            initialRouteName={hasStartPlace ? 'Tabs' : 'Setup'}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Setup" component={SetupScreen} />
            {/*
              Reachable only by a restored navigation state written before
              the Plan tab became the plan. It keeps its Back chip, because
              in that mounting there genuinely is something behind it.
            */}
            <Stack.Screen name="DayPlan">
              {() => <PlanScreen showBack />}
            </Stack.Screen>
            <Stack.Screen name="StartDay" component={StartDayScreen} />
            <Stack.Screen name="Stamp" component={StampScreen} />
            <Stack.Screen name="AddPlace" component={AddPlaceScreen} />
            <Stack.Screen name="CostSplit" component={CostSplitScreen} />
            <Stack.Screen name="Wishlists" component={WishlistsScreen} />
            <Stack.Screen name="Wishlist" component={WishlistScreen} />
            <Stack.Screen name="Feed" component={FeedScreen} />
            <Stack.Screen name="Post" component={PostScreen} />
            <Stack.Screen name="PublishDay" component={PublishDayScreen} />
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
