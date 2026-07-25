import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedPostCard } from '../components/FeedPostCard';
import type { Category } from '../domain/types';
import type { FeedPost } from '../domain/social';
import type { RootStackParamList, TabParamList } from '../navigation';
import { socialService } from '../services/social';
import { useSocialStore } from '../store/useSocialStore';
import { categoryColors, categoryLabels, colors } from '../theme/colors';

const THEMES: Category[] = ['food', 'historical', 'nature', 'shopping', 'nightlife', 'cafe'];

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Discover'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Discover — the public feed (Phase 3). Theme discovery chips over a feed of
 * shared day plans. Clay stays in the tab bar; the clone-to-trips clay action
 * lives on the post detail. Cloning from a card is a quick, neutral affordance.
 */
export function DiscoverScreen({ navigation }: Props) {
  const [seedPosts, setSeedPosts] = useState<FeedPost[]>([]);
  const [theme, setTheme] = useState<Category | null>(null);
  const myPosts = useSocialStore((s) => s.myPosts);

  useEffect(() => {
    socialService.listFeed().then(setSeedPosts);
  }, []);

  // Your published plans surface at the top of the feed.
  const posts = useMemo(() => [...myPosts, ...seedPosts], [myPosts, seedPosts]);
  const visible = useMemo(
    () => (theme ? posts.filter((p) => p.themes.includes(theme)) : posts),
    [posts, theme]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Discover</Text>
          <Text style={styles.subtitle}>Day plans people made in the Bay Area</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.postBtn, pressed && styles.postPressed]}
          onPress={() => navigation.navigate('ShareChooser')}
        >
          <MaterialCommunityIcons name="plus" size={16} color={colors.textPrimary} />
          <Text style={styles.postText}>Post</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsWrap}
      >
        <ThemeChip label="All" color={colors.positive} active={theme === null} onPress={() => setTheme(null)} />
        {THEMES.map((c) => (
          <ThemeChip
            key={c}
            label={categoryLabels[c]}
            color={categoryColors[c]}
            showDot
            active={theme === c}
            onPress={() => setTheme(theme === c ? null : c)}
          />
        ))}
      </ScrollView>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <FeedPostCard
            post={item}
            onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
            onClone={() => navigation.navigate('PostDetail', { postId: item.id })}
            onAuthorPress={() => navigation.navigate('UserProfile', { userId: item.author.id })}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="compass-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyText}>No plans in this theme yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function ThemeChip({
  label,
  color,
  showDot = false,
  active,
  onPress,
}: {
  label: string;
  color: string;
  showDot?: boolean;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}>
      {showDot && !active && <View style={[styles.chipDot, { backgroundColor: color }]} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '500', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceInput,
    borderRadius: 16,
    paddingLeft: 10,
    paddingRight: 13,
    height: 34,
  },
  postPressed: { backgroundColor: colors.borderStrong },
  postText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  chipsWrap: { flexGrow: 0 },
  chips: { gap: 7, paddingHorizontal: 16, paddingVertical: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 30,
  },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { color: '#FFFFFF' },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 },
  empty: { alignItems: 'center', gap: 6, paddingTop: 60 },
  emptyText: { fontSize: 13, color: colors.textMuted },
});
