import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SignIn } from '../components/SignIn';
import { formatTime } from '../lib/geo';
import type { RootStackParamList } from '../navigation';
import { serverMessage } from '../lib/serverError';
import { listFeed, listMyPosts, type FeedPost } from '../services/feed';
import { hasBackend } from '../services/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Feed'>;

/**
 * Days other people have published (PRD §3.8).
 *
 * A feed of arrangements rather than photographs: what somebody did, in what
 * order, in a window you can compare with your own. That is deliberate for
 * now — §120 keeps photo sharing behind moderation tooling, and this is the
 * first release of that tooling.
 *
 * Yours is a separate tab rather than a profile page, because the only thing
 * this app needs to show you about yourself is what you published and what
 * happened to it.
 */
export function FeedScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);

  const [tab, setTab] = useState<'everyone' | 'yours'>('everyone');
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  const refresh = useCallback(async () => {
    if (status !== 'signedIn' || !session) return;
    setPosts(null);
    try {
      setPosts(
        tab === 'everyone' ? await listFeed() : await listMyPosts(session.user.id)
      );
    } catch (e) {
      Alert.alert('Could not load the feed', serverMessage(e));
      setPosts([]);
    }
  }, [status, session, tab]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={26}
            color={colors.textSecondary}
          />
        </Pressable>
        <Text style={styles.title}>Days out</Text>
      </View>

      {!hasBackend ? (
        <Text style={styles.body}>
          This build has no server configured, so the feed is off. Everything
          else works exactly as it always has.
        </Text>
      ) : status === 'loading' ? (
        <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
      ) : status === 'signedOut' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <SignIn reason="feed" />
        </ScrollView>
      ) : (
        <>
          <View style={styles.tabs}>
            {(['everyone', 'yours'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, t === tab && styles.tabOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: t === tab }}
              >
                <Text style={[styles.tabText, t === tab && styles.tabTextOn]}>
                  {t === 'everyone' ? 'Everyone' : 'Yours'}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
          >
            {posts === null ? (
              <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
            ) : posts.length === 0 ? (
              <Text style={styles.body}>
                {tab === 'everyone'
                  ? 'Nothing published yet. Plan a day and put it here — it is the only way this fills up.'
                  : 'You have not published a day yet. Open a plan and publish it from there.'}
              </Text>
            ) : (
              posts.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('Post', { id: p.id })}
                >
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {p.title}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {p.authorName} · {p.places.length}{' '}
                    {p.places.length === 1 ? 'stop' : 'stops'} ·{' '}
                    {formatTime(p.dayStartMin)}–{formatTime(p.homeByMin)}
                  </Text>
                  <Text style={styles.cardPlaces} numberOfLines={1}>
                    {p.places.map((s) => s.placeName).join(' · ')}
                  </Text>
                  {/*
                    Only its author ever sees this row — the read policy hides
                    a taken-down post from everyone else. Showing it is the
                    point: a post that vanished with no explanation teaches
                    the author nothing.
                  */}
                  {p.hiddenAt && (
                    <Text style={styles.hidden}>
                      {p.hiddenReason ?? 'Hidden while it is reviewed.'}
                    </Text>
                  )}
                </Pressable>
              ))
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 2,
    borderRadius: 11,
    backgroundColor: colors.surfaceAlt,
  },
  tab: { flex: 1, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.surface },
  tabText: { fontSize: 12, color: colors.textSecondary },
  tabTextOn: { color: colors.textPrimary, fontWeight: '500' },
  content: { padding: 16, gap: 11 },
  spinner: { marginTop: 28 },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, padding: 16 },
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    gap: 5,
  },
  cardTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  cardMeta: { fontSize: 11, color: colors.textMuted },
  cardPlaces: { fontSize: 12, color: colors.textSecondary },
  hidden: { fontSize: 11, color: colors.warning, marginTop: 3 },
});
