import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { FeedPostCard } from '../components/FeedPostCard';
import { NavHeader } from '../components/NavHeader';
import type { FeedPost, User } from '../domain/social';
import { formatCount } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { socialService } from '../services/social';
import { useSocialStore } from '../store/useSocialStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

/**
 * Public profile (Phase 3): identity, follower/following counts, and the day
 * plans this person has published. Following is a real local toggle; the clay
 * Follow button is the single primary (self view shows a neutral Edit instead).
 */
export function UserProfileScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const isSelf = userId === socialService.currentUser().id;
  const followedIds = useSocialStore((s) => s.followedUserIds);
  const toggleFollow = useSocialStore((s) => s.toggleFollow);
  const myPosts = useSocialStore((s) => s.myPosts);

  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([socialService.listFeed(), socialService.listMyPlans()]).then(
      ([feed, mine]) => {
        if (!alive) return;
        setUser(socialService.getUser(userId) ?? null);
        const authored = feed.filter((p) => p.author.id === userId);
        setPosts(isSelf ? [...myPosts, ...mine, ...authored] : authored);
      }
    );
    return () => {
      alive = false;
    };
  }, [userId, isSelf, myPosts]);

  if (!user) return <SafeAreaView style={styles.screen} edges={['top']} />;

  const following = followedIds.includes(userId);
  const followers = (user.followers ?? 0) + (following ? 1 : 0);

  const shareProfile = () => {
    Share.share({
      message: `Follow ${user.name} (@${user.handle}) on TripCircle`,
      url: `https://tripcircle.app/u/${user.handle}`,
    }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader
        title={`@${user.handle}`}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={shareProfile} hitSlop={8}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Avatar user={user} size={64} />
          <View style={styles.heroText}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.handle}>@{user.handle} · {user.homeCity}</Text>
          </View>
        </View>

        {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

        <View style={styles.statsRow}>
          <Stat value={formatCount(followers)} label="Followers" />
          <Stat value={formatCount(user.following ?? 0)} label="Following" />
          <Stat value={String(posts.length)} label="Plans" />
        </View>

        {isSelf ? (
          <View style={styles.editBtn}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.editText}>Edit profile</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              following ? styles.followingBtn : styles.followBtn,
              pressed && styles.pressed,
            ]}
            onPress={() => toggleFollow(userId)}
          >
            {following ? (
              <>
                <MaterialCommunityIcons name="check" size={16} color={colors.positive} />
                <Text style={styles.followingText}>Following</Text>
              </>
            ) : (
              <Text style={styles.followText}>Follow</Text>
            )}
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>
          {isSelf ? 'Your plans' : 'Published plans'} · {posts.length}
        </Text>
        {posts.map((p) => (
          <FeedPostCard
            key={p.id}
            post={p}
            onPress={() => navigation.navigate('PostDetail', { postId: p.id })}
            onClone={() => navigation.navigate('PostDetail', { postId: p.id })}
          />
        ))}
        {posts.length === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="map-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {isSelf ? 'Publish a day out to see it here' : 'No published plans yet'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 8 },
  heroText: { flex: 1 },
  name: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
  handle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  bio: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, paddingTop: 14 },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  followBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  followText: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
  followingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.positive,
    backgroundColor: colors.selectedWell,
    marginTop: 14,
  },
  followingText: { fontSize: 15, fontWeight: '500', color: colors.positive },
  pressed: { opacity: 0.9 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: 14,
  },
  editText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  sectionLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, paddingTop: 24, paddingBottom: 12 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 30 },
  emptyText: { fontSize: 13, color: colors.textMuted },
});
