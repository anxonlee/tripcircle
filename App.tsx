import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TabBar } from './src/components/TabBar';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { AiPlanScreen } from './src/screens/AiPlanScreen';
import { CostSplitScreen } from './src/screens/CostSplitScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { PassportScreen } from './src/screens/PassportScreen';
import { PlacesScreen } from './src/screens/PlacesScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { PostDetailScreen } from './src/screens/PostDetailScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { PublishScreen } from './src/screens/PublishScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { ShareChooserScreen } from './src/screens/ShareChooserScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { UserProfileScreen } from './src/screens/UserProfileScreen';
import { WishlistScreen } from './src/screens/WishlistScreen';
import { useTripStore } from './src/store/useTripStore';
import { colors } from './src/theme/colors';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Explore" component={PlacesScreen} />
      <Tab.Screen name="Trips" component={TripsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
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
            <Stack.Screen name="Plan" component={PlanScreen} />
            <Stack.Screen name="Wishlist" component={WishlistScreen} />
            <Stack.Screen name="PostDetail" component={PostDetailScreen} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} />
            <Stack.Screen name="CostSplit" component={CostSplitScreen} />
            <Stack.Screen name="Passport" component={PassportScreen} />
            <Stack.Screen name="AiPlan" component={AiPlanScreen} />
            <Stack.Screen name="Publish" component={PublishScreen} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} />
            <Stack.Screen name="ShareChooser" component={ShareChooserScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
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
