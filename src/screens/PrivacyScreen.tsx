import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Privacy'>;

/**
 * In-app privacy summary (PRD §10, App Store Review Guideline 5.1.1).
 *
 * Apple requires a privacy policy link in App Store metadata AND inside the
 * app, and checks that the in-app one reaches a real webpage — so this
 * screen carries the substance in plain language and links out to the
 * canonical hosted policy rather than replacing it.
 *
 * The claims here are deliberately specific ("read once, then discarded"
 * rather than "we respect your privacy"), because a vague policy is exactly
 * what §3A.6 is trying not to be. Keep this screen, PRIVACY.md, and the
 * actual behaviour in step: if one changes, all three change.
 */

/**
 * The canonical policy. Must stay reachable — App Review follows this link
 * and a dead URL is a 5.1.1 rejection. Hosted on Netlify; if the deployment
 * URL changes, update it here.
 */
const POLICY_URL = 'https://cool-starburst-afbe4b.netlify.app/';

const POINTS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'cellphone-lock',
    title: 'Your diary stays on this phone',
    body: 'Visits, notes, ratings, and photos are stored on your device. There is no account and no server of ours, so nobody else can read them.',
  },
  {
    icon: 'crosshairs-gps',
    title: 'Location is read once, when you stamp',
    body: 'Tapping to stamp reads your location at that moment to find nearby places, then discards it. It is never saved to a visit and never leaves the phone. There is no background tracking.',
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
    icon: 'tray-arrow-up',
    title: 'Backups go where you send them',
    body: 'A backup contains your visits and photos. Attached photos are re-encoded to strip the camera metadata, so the coordinates and capture time do not travel with them. Once you share the file, it follows that service’s rules — treat it like any personal document.',
  },
  {
    icon: 'map-outline',
    title: 'Maps come from Apple',
    body: 'Showing a map tells Apple which area is on screen, which is what draws it. We receive nothing from that.',
  },
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
          To take your data with you, use Back up on the Summary tab. To erase
          everything, delete a visit or delete the app — there is nothing on our
          side to remove.
        </Text>

        <Pressable
          style={styles.link}
          onPress={() => Linking.openURL(POLICY_URL)}
        >
          <Text style={styles.linkText}>Read the full policy</Text>
          <MaterialCommunityIcons name="open-in-new" size={15} color={colors.accent} />
        </Pressable>
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
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { fontSize: 14, fontWeight: '500', color: colors.accent },
});
