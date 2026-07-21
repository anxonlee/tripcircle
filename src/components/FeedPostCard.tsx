import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedPost } from '../domain/social';
import { formatCount, formatDuration, formatYen } from '../lib/format';
import { categoryColors, categoryLabels, colors, tint } from '../theme/colors';
import { Avatar } from './Avatar';
import { CoverBlock } from './CoverBlock';

/**
 * Feed post card (Phase 3): themed cover with the title overlaid, author row,
 * blurb, plan meta, and social stats with a ghost clone action. No clay here —
 * browsing screens keep the single clay action in the tab bar (ui-guide §2);
 * the clay clone lives on the post detail (a pushed screen).
 */
export function FeedPostCard({
  post,
  onPress,
  onClone,
  onAuthorPress,
}: {
  post: FeedPost;
  onPress: () => void;
  onClone: () => void;
  onAuthorPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <CoverBlock themes={post.themes} height={128} radius={0}>
        <View style={styles.coverScrim} />
        <View style={styles.coverText}>
          <Text style={styles.coverTitle} numberOfLines={1}>
            {post.title}
          </Text>
          <Text style={styles.coverMeta} numberOfLines={1}>
            {post.city} · {post.themes.map((t) => categoryLabels[t]).join(' · ')}
          </Text>
        </View>
      </CoverBlock>

      <View style={styles.body}>
        <View style={styles.authorRow}>
          <Pressable
            style={styles.authorTap}
            onPress={onAuthorPress}
            disabled={!onAuthorPress}
            hitSlop={6}
          >
            <Avatar user={post.author} size={26} />
            <View style={styles.authorText}>
              <Text style={styles.authorName} numberOfLines={1}>
                {post.author.name}
              </Text>
              <Text style={styles.authorHandle} numberOfLines={1}>
                @{post.author.handle} · {post.postedAgo}
              </Text>
            </View>
          </Pressable>
          {post.themes.slice(0, 1).map((t) => (
            <View key={t} style={[styles.themeTag, { backgroundColor: tint(categoryColors[t]) }]}>
              <Text style={[styles.themeTagText, { color: categoryColors[t] }]}>
                {categoryLabels[t]}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.blurb} numberOfLines={2}>
          {post.blurb}
        </Text>

        <View style={styles.metaRow}>
          <Meta icon="clock-outline" text={formatDuration(post.durationMin)} />
          <Meta icon="wallet-outline" text={formatYen(post.costYen)} />
          <Meta icon="map-marker-outline" text={`${post.stopIds.length} stops`} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stats}>
            <Stat icon="bookmark-outline" text={formatCount(post.saves)} />
            <Stat icon="source-branch" text={formatCount(post.clones)} />
          </View>
          <Pressable onPress={onClone} hitSlop={8} style={styles.cloneBtn}>
            <MaterialCommunityIcons name="plus" size={14} color={colors.textSecondary} />
            <Text style={styles.cloneText}>Clone</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

function Stat({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.statText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  coverScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  coverText: { padding: 12 },
  coverTitle: { fontSize: 18, fontWeight: '500', color: colors.textPrimary },
  coverMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  body: { padding: 12, gap: 9 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorText: { flex: 1 },
  authorName: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  authorHandle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  themeTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  themeTagText: { fontSize: 11, fontWeight: '500' },
  blurb: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  metaRow: { flexDirection: 'row', gap: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 9,
  },
  stats: { flexDirection: 'row', gap: 16 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontSize: 12, color: colors.textSecondary },
  cloneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  cloneText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
});
