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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTime } from '../lib/geo';
import { serverMessage } from '../lib/serverError';
import type { RootStackParamList } from '../navigation';
import {
  addComment,
  blockUser,
  deleteComment,
  deletePost,
  listComments,
  listFeed,
  listMyPosts,
  report,
  type FeedComment,
  type FeedPost,
  type ReportReason,
} from '../services/feed';
import { placesService } from '../services/places';
import { useAuthStore } from '../store/useAuthStore';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Post'>;

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam or an advert' },
  { id: 'offensive', label: 'Offensive or abusive' },
  { id: 'wrong', label: 'Wrong or misleading' },
  { id: 'other', label: 'Something else' },
];

/**
 * One published day, its comments, and the two things anyone reading public
 * content has to be able to do about it: report it, and never see that
 * person again.
 *
 * Both are one tap from the post rather than buried in a settings page.
 * Guideline 1.2 asks for a reporting mechanism and a way to block abusive
 * users; a mechanism nobody can find is not one.
 */
export function PostScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const session = useAuthStore((s) => s.session);
  const setSelection = useTripStore((s) => s.setSelection);

  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const mine = Boolean(post && session && post.authorId === session.user.id);

  const refresh = useCallback(async () => {
    try {
      // Read through the same lists the feed uses, so a post that has been
      // hidden or blocked simply is not there — the visibility rules stay in
      // one place rather than being re-implemented per screen.
      const all = session
        ? [...(await listFeed(100)), ...(await listMyPosts(session.user.id))]
        : await listFeed(100);
      setPost(all.find((p) => p.id === route.params.id) ?? null);
      setComments(await listComments(route.params.id));
    } catch (e) {
      Alert.alert('Could not load that day', serverMessage(e));
    }
  }, [route.params.id, session]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  /** Clone (§342): the same places, re-anchored to the reader's own start. */
  const cloneDay = async () => {
    if (!post) return;
    const all = await placesService.listPlaces();
    const known = new Set(all.map((p) => p.id));
    const usable = post.places.filter((p) => known.has(p.placeId));
    const missing = post.places.length - usable.length;
    if (usable.length === 0) {
      Alert.alert(
        'Nothing here your copy knows',
        'None of these places are in your build, so there is nothing to plan.'
      );
      return;
    }
    Alert.alert(
      'Plan this day?',
      [
        `${usable.length} ${usable.length === 1 ? 'place goes' : 'places go'} to your Plan tab.`,
        missing > 0 ? `${missing} are not in your places and will be left out.` : null,
        'It is worked out again from your own start place — theirs was never shared.',
        'This replaces whatever you had selected.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Plan it',
          onPress: () => {
            setSelection(usable.map((p) => p.placeId));
            navigation.navigate('DayPlan');
          },
        },
      ]
    );
  };

  const doReport = (subjectType: 'post' | 'comment', subjectId: string) => {
    if (!session) return;
    Alert.alert(
      'Report this?',
      'It goes to us for review. The person is not told who reported it.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...REASONS.map((r) => ({
          text: r.label,
          onPress: async () => {
            try {
              await report({
                reporterId: session.user.id,
                subjectType,
                subjectId,
                reason: r.id,
              });
              Alert.alert('Thank you', 'We will take a look.');
              await refresh();
            } catch (e) {
              Alert.alert('Could not report that', serverMessage(e));
            }
          },
        })),
      ]
    );
  };

  const doBlock = () => {
    if (!post || !session) return;
    Alert.alert(
      `Block ${post.authorName}?`,
      'You will not see their days or comments, and they will not see yours. They are not told.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(session.user.id, post.authorId);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Could not block them', serverMessage(e));
            }
          },
        },
      ]
    );
  };

  const removePost = () => {
    Alert.alert('Delete this day?', 'It goes from the feed for everyone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deletePost(route.params.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not delete it', serverMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const send = async () => {
    if (!session || !draft.trim()) return;
    setBusy(true);
    try {
      await addComment(route.params.id, session.user.id, draft);
      setDraft('');
      await refresh();
    } catch (e) {
      Alert.alert('Could not add that', serverMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {post?.title ?? 'A day out'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {post === null ? (
          <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
        ) : (
          <>
            <Text style={styles.meta}>
              {post.authorName} · {formatTime(post.dayStartMin)}–
              {formatTime(post.homeByMin)}
            </Text>
            {post.hiddenAt && (
              <Text style={styles.hidden}>
                {post.hiddenReason ?? 'Hidden while it is reviewed.'}
              </Text>
            )}
            {post.note ? <Text style={styles.note}>{post.note}</Text> : null}

            {post.places.map((p, i) => (
              <View key={`${p.placeId}-${i}`} style={styles.stop}>
                <Text style={styles.stopNum}>{i + 1}</Text>
                <Text style={styles.stopName}>{p.placeName}</Text>
              </View>
            ))}

            <Pressable style={styles.primary} onPress={cloneDay}>
              <MaterialCommunityIcons name="map-outline" size={16} color="#FFFFFF" />
              <Text style={styles.primaryText}>Plan this day yourself</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Comments</Text>
            {comments === null ? (
              <ActivityIndicator color={colors.textMuted} />
            ) : comments.length === 0 ? (
              <Text style={styles.body}>Nothing said yet.</Text>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={styles.comment}>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>{c.authorName}</Text>
                    <Text style={styles.commentText}>{c.body}</Text>
                  </View>
                  {c.authorId === session?.user.id || mine ? (
                    <Pressable
                      onPress={async () => {
                        try {
                          await deleteComment(c.id);
                          await refresh();
                        } catch (e) {
                          Alert.alert('Could not remove that', serverMessage(e));
                        }
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove this comment"
                    >
                      <MaterialCommunityIcons name="close" size={15} color={colors.textMuted} />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => doReport('comment', c.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Report ${c.authorName}'s comment`}
                    >
                      <MaterialCommunityIcons name="flag-outline" size={15} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              ))
            )}

            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder="Say something"
                placeholderTextColor={colors.textMuted}
                value={draft}
                onChangeText={setDraft}
                editable={!busy}
                multiline
              />
              <Pressable
                style={[styles.addBtn, (!draft.trim() || busy) && styles.addBtnOff]}
                disabled={!draft.trim() || busy}
                onPress={send}
                accessibilityRole="button"
                accessibilityLabel="Post this comment"
              >
                <MaterialCommunityIcons name="arrow-up" size={16} color="#FFFFFF" />
              </Pressable>
            </View>

            {/*
              The safety row. On the post itself, not behind a menu: a
              reporting mechanism nobody can find does not meet the
              obligation it exists for.
            */}
            <View style={styles.safety}>
              {mine ? (
                <Pressable onPress={removePost} disabled={busy}>
                  <Text style={styles.danger}>Delete this day</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable onPress={() => doReport('post', route.params.id)}>
                    <Text style={styles.safetyText}>Report this day</Text>
                  </Pressable>
                  <Pressable onPress={doBlock}>
                    <Text style={styles.safetyText}>Block {post.authorName}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
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
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  content: { padding: 16, gap: 10 },
  spinner: { marginTop: 28 },
  meta: { fontSize: 12, color: colors.textMuted },
  hidden: { fontSize: 12, color: colors.warning, lineHeight: 17 },
  note: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceAlt,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 11,
    color: colors.textSecondary,
  },
  stopName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  primary: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  primaryText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  sectionTitle: { fontSize: 12, color: colors.textSecondary, marginTop: 10 },
  body: { fontSize: 13, color: colors.textSecondary },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  commentBody: { flex: 1, gap: 2 },
  commentAuthor: { fontSize: 11, color: colors.textMuted },
  commentText: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 11,
    backgroundColor: colors.surfaceInput,
    fontSize: 13,
    color: colors.textPrimary,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addBtnOff: { opacity: 0.35 },
  safety: { marginTop: 20, gap: 12, alignItems: 'flex-start' },
  safetyText: { fontSize: 12, color: colors.textSecondary },
  danger: { fontSize: 12, color: colors.warning },
});
