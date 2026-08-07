import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { CategoryPin, PIN_ANCHOR, PinSlot } from '../components/CategoryPin';
import { CoverBlock } from '../components/CoverBlock';
import { NavHeader } from '../components/NavHeader';
import { TimelineNode } from '../components/IconTile';
import type { Comment, FeedPost } from '../domain/social';
import type { Place } from '../domain/types';
import { formatCount, formatDuration, formatUsd } from '../lib/format';
import { sharePost } from '../lib/share';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { socialService } from '../services/social';
import { useSocialStore } from '../store/useSocialStore';
import { categoryLabels, colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;

/**
 * A shared day plan opened from the feed (Phase 3): full itinerary, live
 * comments you can post and like, a save toggle, native share, and the clone
 * loop's clay action. Author name/avatar open the public profile.
 */
export function PostDetailScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const me = socialService.currentUser();
  const myPosts = useSocialStore((s) => s.myPosts);
  const userComments = useSocialStore((s) => s.commentsByPost[postId]);
  const likedCommentIds = useSocialStore((s) => s.likedCommentIds);
  const savedPostIds = useSocialStore((s) => s.savedPostIds);
  const addComment = useSocialStore((s) => s.addComment);
  const toggleCommentLike = useSocialStore((s) => s.toggleCommentLike);
  const togglePostSave = useSocialStore((s) => s.togglePostSave);

  const [post, setPost] = useState<FeedPost | null>(null);
  const [stops, setStops] = useState<Place[]>([]);
  const [seedComments, setSeedComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [cloned, setCloned] = useState(false);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    let alive = true;
    const mine = myPosts.find((p) => p.id === postId);
    Promise.all([
      mine ? Promise.resolve(mine) : socialService.getPost(postId),
      placesService.listPlaces(),
      socialService.listComments(postId),
    ]).then(([p, places, cs]) => {
      if (!alive || !p) return;
      setPost(p);
      setSeedComments(cs);
      const byId = new Map(places.map((x) => [x.id, x]));
      setStops(p.stopIds.map((id) => byId.get(id)).filter((x): x is Place => !!x));
    });
    return () => {
      alive = false;
    };
  }, [postId, myPosts]);

  const comments = useMemo(
    () => [...seedComments, ...(userComments ?? [])],
    [seedComments, userComments]
  );

  const routeCoords = useMemo(() => stops.map((s) => s.location), [stops]);

  useEffect(() => {
    if (routeCoords.length > 1) {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: 40, left: 40, right: 40, bottom: 40 },
        animated: false,
      });
    }
  }, [routeCoords]);

  if (!post) {
    return <SafeAreaView style={styles.screen} edges={['top']} />;
  }

  const saved = savedPostIds.includes(post.id);
  const saveCount = post.saves + (saved ? 1 : 0);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    addComment(postId, {
      id: `c-${Date.now()}`,
      author: me,
      text,
      ago: 'now',
      likes: 0,
    });
    setDraft('');
  };

  const openAuthor = () =>
    navigation.navigate('UserProfile', { userId: post.author.id });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader
        title="Shared plan"
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => sharePost(post)} hitSlop={8}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <CoverBlock themes={post.themes} height={150} style={styles.cover}>
          <View style={styles.coverText}>
            <Text style={styles.coverTitle}>{post.title}</Text>
            <Text style={styles.coverMeta}>
              {post.city} · {post.themes.map((t) => categoryLabels[t]).join(' · ')}
            </Text>
          </View>
        </CoverBlock>

        <View style={styles.authorRow}>
          <Pressable style={styles.authorTap} onPress={openAuthor} hitSlop={6}>
            <Avatar user={post.author} size={36} />
            <View style={styles.authorText}>
              <Text style={styles.authorName}>{post.author.name}</Text>
              <Text style={styles.authorHandle}>@{post.author.handle} · {post.postedAgo}</Text>
            </View>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={() => togglePostSave(post.id)} hitSlop={6}>
            <MaterialCommunityIcons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={16}
              color={saved ? colors.accent : colors.textMuted}
            />
            <Text style={[styles.saveText, saved && styles.saveTextOn]}>{formatCount(saveCount)}</Text>
          </Pressable>
        </View>

        <Text style={styles.blurb}>{post.blurb}</Text>

        <View style={styles.summaryRow}>
          <SummaryCell label="Time" value={formatDuration(post.durationMin)} />
          <View style={styles.vline} />
          <SummaryCell label="Spend" value={formatUsd(post.costUsd)} />
          <View style={styles.vline} />
          <SummaryCell label="Stops" value={String(post.stopIds.length)} />
        </View>

        {routeCoords.length > 0 && (
          <View style={styles.mapCard}>
            <MapView
              ref={mapRef}
              style={styles.map}
              pointerEvents="none"
              initialRegion={{
                ...routeCoords[0],
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
            >
              <Polyline
                coordinates={routeCoords}
                strokeColor="rgba(217,119,87,0.9)"
                strokeWidth={3}
                lineDashPattern={[2, 6]}
                lineCap="round"
              />
              {stops.map((s, i) => (
                <Marker
                  key={s.id}
                  coordinate={s.location}
                  anchor={PIN_ANCHOR}
                  tracksViewChanges={false}
                >
                  <PinSlot>
                    <CategoryPin categories={s.categories} size={26} label={String(i + 1)} />
                  </PinSlot>
                </Marker>
              ))}
            </MapView>
          </View>
        )}

        <Text style={styles.sectionLabel}>The day</Text>
        <View style={styles.timeline}>
          {stops.map((s, i) => (
            <View key={s.id} style={styles.stopRow}>
              <View style={styles.spineCol}>
                <TimelineNode categories={s.categories} label={String(i + 1)} />
                {i < stops.length - 1 && <View style={styles.spine} />}
              </View>
              <View style={styles.stopBody}>
                <Text style={styles.stopName}>{s.name}</Text>
                <Text style={styles.stopMeta}>
                  {s.categories.map((c) => categoryLabels[c]).join(' · ')} ·{' '}
                  {formatDuration(s.visitDurationMin)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Comments · {comments.length}</Text>
        <View style={styles.comments}>
          {comments.map((c) => {
            const liked = likedCommentIds.includes(c.id);
            const likes = c.likes + (liked ? 1 : 0);
            return (
              <View key={c.id} style={styles.comment}>
                <Avatar user={c.author} size={30} />
                <View style={styles.commentBody}>
                  <Text style={styles.commentHead}>
                    <Text style={styles.commentName}>{c.author.name}</Text>
                    <Text style={styles.commentAgo}>  {c.ago}</Text>
                  </Text>
                  <Text style={styles.commentText}>{c.text}</Text>
                  <Pressable
                    style={styles.commentLikes}
                    onPress={() => toggleCommentLike(c.id)}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons
                      name={liked ? 'heart' : 'heart-outline'}
                      size={13}
                      color={liked ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.commentLikeText, liked && styles.commentLikeOn]}>{likes}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {comments.length === 0 && (
            <Text style={styles.noComments}>No comments yet — be the first.</Text>
          )}
        </View>

        <View style={styles.composer}>
          <Avatar user={me} size={30} />
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, !draft.trim() && styles.sendDisabled]}
            onPress={send}
            disabled={!draft.trim()}
            hitSlop={6}
          >
            <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {cloned ? (
          <View style={styles.clonedBtn}>
            <MaterialCommunityIcons name="check" size={18} color={colors.positive} />
            <Text style={styles.clonedText}>Added to your trips</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.cloneBtn, pressed && styles.cloneBtnPressed]}
            onPress={() => setCloned(true)}
          >
            <MaterialCommunityIcons name="source-branch" size={18} color="#FFFFFF" />
            <Text style={styles.cloneText}>Clone to my trips</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingBottom: 24 },
  cover: { marginHorizontal: 16 },
  coverText: { padding: 14 },
  coverTitle: { fontSize: 22, fontWeight: '500', color: colors.textPrimary },
  coverMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  authorTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorText: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  authorHandle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  saveText: { fontSize: 12, color: colors.textMuted },
  saveTextOn: { color: colors.accent, fontWeight: '500' },
  blurb: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  cell: { flex: 1, alignItems: 'center' },
  cellValue: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  cellLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  vline: { width: 1, height: 28, backgroundColor: colors.border },
  mapCard: {
    height: 190,
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 10,
  },
  timeline: { paddingHorizontal: 16 },
  stopRow: { flexDirection: 'row', gap: 12 },
  spineCol: { alignItems: 'center', width: 30 },
  spine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stopBody: { flex: 1, paddingBottom: 16 },
  stopName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  stopMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  comments: { paddingHorizontal: 16, gap: 16 },
  comment: { flexDirection: 'row', gap: 10 },
  commentBody: { flex: 1 },
  commentHead: { fontSize: 13 },
  commentName: { fontWeight: '500', color: colors.textPrimary },
  commentAgo: { color: colors.textMuted, fontSize: 12 },
  commentText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 3 },
  commentLikes: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  commentLikeText: { fontSize: 12, color: colors.textMuted },
  commentLikeOn: { color: colors.accent },
  noComments: { fontSize: 13, color: colors.textMuted },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 18,
    padding: 8,
    paddingLeft: 10,
    borderRadius: 24,
    backgroundColor: colors.surfaceInput,
  },
  composerInput: { flex: 1, fontSize: 14, color: colors.textPrimary, maxHeight: 90 },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.borderStrong },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  cloneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  cloneBtnPressed: { opacity: 0.9 },
  cloneText: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
  clonedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.positive,
    backgroundColor: colors.selectedWell,
  },
  clonedText: { fontSize: 15, fontWeight: '500', color: colors.positive },
});
