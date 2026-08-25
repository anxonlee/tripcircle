import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config } from '../config';
import type { RootStackParamList } from '../navigation';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Privacy'>;

/**
 * In-app privacy summary (PRD §10, App Store Review Guideline 5.1.1).
 *
 * Apple requires a privacy policy link in App Store metadata AND inside the
 * app, and checks that the in-app one reaches a real webpage. TripCircle has
 * no hosted page of its own yet, so for now this screen is the policy rather
 * than a plain-language summary of one — see the note above the points.
 *
 * The claims here are deliberately specific ("read once, then discarded"
 * rather than "we respect your privacy"), because a vague policy is exactly
 * what §3A.6 is trying not to be.
 *
 * Keep this screen and the actual behaviour in step: if one changes, so does
 * the other. `CCMFHK-economic` carries PRIVACY.md and docs/privacy/index.html
 * for PIRT, which is a different app with different data flows — treat them
 * as a model for a TripCircle page, never as a description of this one.
 *
 * Two of the points below are computed rather than written down, because both
 * describe behaviour that varies by build:
 *
 *  - the provider point appears only when `config.useRealProviders` is set,
 *    which is the same flag that decides whether anything reaches Google at
 *    all. Deriving the copy from the switch is the only way it cannot end up
 *    describing a build it is not in;
 *  - the map point names Apple or Google by platform. react-native-maps draws
 *    with MapKit on iOS and the Google Maps SDK on Android, so a single
 *    sentence is wrong on one of them.
 */

/**
 * There is deliberately no "read the full policy" link here yet.
 *
 * This screen used to open https://cool-starburst-afbe4b.netlify.app/, which
 * is PIRT's policy: a different app, headed with PIRT's name, describing an
 * app that has no Google integration at all. Sending a TripCircle tester
 * there is worse than sending them nowhere, so until TripCircle has a page of
 * its own this screen is the whole policy rather than a summary of one.
 *
 * BEFORE EXTERNAL TESTFLIGHT OR APP STORE SUBMISSION, the link has to come
 * back. Guideline 5.1.1(i) wants a privacy policy reachable from inside the
 * app as well as from App Store Connect, and Beta App Review applies it to
 * external TestFlight builds. Internal testing skips that review, which is
 * the only reason this is survivable now.
 *
 * The page to deploy is already written, at docs/privacy/index.html. Deploy
 * it to a site of its own, never over PIRT's, then restore a POLICY_URL here
 * pointing at it. PRIVACY.md at the repository root has the rest.
 */

type Point = { icon: string; title: string; body: string };

/**
 * Drawn with MapKit on iOS and the Google Maps SDK on Android — the same
 * `react-native-maps` component, a different map underneath.
 */
const MAP_POINT: Point =
  Platform.OS === 'android'
    ? {
        icon: 'map-outline',
        title: 'Maps come from Google',
        body: 'Showing a map tells Google which area is on screen, which is what draws it. We receive nothing from that.',
      }
    : {
        icon: 'map-outline',
        title: 'Maps come from Apple',
        body: 'Showing a map tells Apple which area is on screen, which is what draws it. We receive nothing from that.',
      };

/**
 * Which of these is true depends on how the build is configured (src/config).
 *
 * With a Google key, searching goes to Google and travel times are real.
 * Without one — the usual case — searching goes to OpenStreetMap and travel
 * times stay as the app's own estimates. Saying the
 * wrong one would be a false statement about where a user's typing goes,
 * which is the one thing this screen exists to get right.
 */
const PROVIDER_POINT: Point = {
  icon: 'cloud-search-outline',
  title: 'Searching asks Google',
  body: 'This build looks places up through Google. Searching sends what you type, and roughly where you are searching, so it can answer. Planning a day sends the locations of your stops so the travel times are real ones. Your diary is never part of that. Ratings and opening hours that come back are shown while you are looking at them and are not saved.',
};

const OSM_POINT: Point = {
  icon: 'map-search-outline',
  title: 'Searching asks OpenStreetMap',
  body: 'Beyond its built-in list, the app searches OpenStreetMap through a public search service. Searching sends what you type and the area around your starting point, so it can answer. Nothing else goes with it — not your diary, not where you have been. Places it finds are kept on this phone so a day you planned still makes sense later. Place data © OpenStreetMap contributors, available under the Open Database Licence.',
};

const POINTS: Point[] = [
  {
    icon: 'cellphone-lock',
    title: 'Your diary stays on this phone',
    body: 'Visits, notes, ratings, and photos are stored on your device and are never uploaded. There is now a server, for shared lists and published days, and none of it touches the diary — there is nowhere on it for a visit to go.',
  },
  {
    icon: 'account-multiple-outline',
    title: 'An account is only for planning with other people',
    body: 'Signing in is optional and only unlocks two things: a list you share with people you invite, and publishing a day for anyone signed in to read. We keep your email address to sign you in, and a display name you choose. Nothing else about you is on the server.',
  },
  {
    icon: 'earth',
    title: 'A published day carries less than you would expect',
    body: 'It carries the places, in order, the hours you planned for, and your display name. It does not carry your start place — there is no field for one, so it cannot — nor any address, nor anything from your diary. Anyone signed in can read it, plan it themselves, or comment on it, and you can delete it at any time.',
  },
  {
    icon: 'flag-outline',
    title: 'Reporting and blocking',
    body: 'Every published day and comment can be reported, and anyone can be blocked. Blocking is silent and works both ways: you stop seeing them and they stop seeing you. Something reported by enough separate people is hidden automatically until we look at it. Reports are never shown to the person reported.',
  },
  {
    icon: 'map-marker-outline',
    title: 'Location is read only when you ask for it',
    body: 'Two things read it: stamping a visit, and setting your starting point from where you are. Each takes a single reading, rounds it to about 100 metres, and uses it there and then. A stamp never saves it. A starting point set this way lasts until you close the app and is never written to storage. There is no background tracking.',
  },
  {
    icon: 'image-outline',
    title: 'Photos are only the ones you pick',
    body: 'The app copies the photo you choose into its own storage. It never browses or uploads your library.',
  },
  {
    icon: 'chart-line-variant',
    title: 'No analytics, ads, or trackers',
    body: 'The app does not measure how you use it and contains no advertising or tracking code.',
  },
  {
    icon: 'alert-circle-outline',
    title: 'Crashes are written down, not sent',
    body: 'When something breaks, the app saves the error, where in the code it happened, and which build you are on — on this phone, and only the last few. Nothing is transmitted. If you want us to see it, Settings offers it to the share sheet and you choose where it goes. Your diary is never part of it.',
  },
  {
    icon: 'tray-arrow-up',
    title: 'Backups go where you send them',
    body: 'A backup contains your visits and photos. Attached photos are re-encoded to strip the camera metadata, so the coordinates and capture time do not travel with them. Once you share the file, it follows that service’s rules — treat it like any personal document.',
  },
  MAP_POINT,
  ...(config.useRealProviders ? [PROVIDER_POINT] : [OSM_POINT]),
];

export function PrivacyScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={colors.textSecondary}
          />
        </Pressable>
        <Text style={styles.title}>Privacy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={styles.lede}>
          PIRT keeps your diary on your phone. We cannot read it, because
          it is never sent to us.
        </Text>

        {POINTS.map((p) => (
          <View key={p.title} style={styles.row}>
            <View style={styles.icon}>
              <MaterialCommunityIcons
                name={p.icon as never}
                size={18}
                color={colors.textSecondary}
              />
            </View>
            <View style={styles.body}>
              <Text style={styles.rowTitle}>{p.title}</Text>
              <Text style={styles.rowBody}>{p.body}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.rights}>
          To take your data with you, use Back up on the Settings tab. To erase
          everything, delete a visit or delete the app — there is nothing on our
          side to remove.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
    gap: 12,
  },
  headerSpacer: { width: 24 },
  title: { flex: 1, fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  content: { padding: 16, gap: 18 },
  lede: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  rowBody: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  rights: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
