import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoverBlock } from '../components/CoverBlock';
import { NavHeader } from '../components/NavHeader';
import { TimelineNode } from '../components/IconTile';
import type { FeedPost } from '../domain/social';
import type { Place } from '../domain/types';
import { formatDuration, formatUsd } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import { socialService } from '../services/social';
import { useSocialStore } from '../store/useSocialStore';
import { categoryLabels, colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Publish'>;

type Visibility = 'public' | 'followers';

/**
 * Publish a plan to the feed (Phase 3, authoring side). Compose title + blurb
 * over a themed cover, pick visibility, and post. Adds to the local social
 * store (no backend in the MVP); the clay "Publish" is the single primary.
 */
export function PublishScreen({ route, navigation }: Props) {
  const { city, themes, stopIds } = route.params;
  const publishPost = useSocialStore((s) => s.publishPost);
  const [title, setTitle] = useState(route.params.title);
  const [blurb, setBlurb] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [stops, setStops] = useState<Place[]>([]);

  useEffect(() => {
    placesService.listPlaces().then((all) => {
      const byId = new Map(all.map((p) => [p.id, p]));
      setStops(stopIds.map((id) => byId.get(id)).filter((p): p is Place => !!p));
    });
  }, [stopIds]);

  const costUsd = useMemo(() => stops.reduce((s, p) => s + p.avgCostUsd, 0), [stops]);
  const durationMin = useMemo(
    () => stops.reduce((s, p) => s + p.visitDurationMin, 0) + Math.max(0, stops.length - 1) * 18,
    [stops]
  );

  const canPublish = title.trim().length > 0 && stops.length > 0;

  const publish = () => {
    const me = socialService.currentUser();
    const post: FeedPost = {
      id: `me-${Date.now()}`,
      author: me,
      title: title.trim(),
      city,
      themes,
      blurb: blurb.trim() || `A ${stops.length}-stop day in ${city}.`,
      stopIds,
      durationMin,
      costUsd,
      saves: 0,
      clones: 0,
      postedAgo: 'now',
    };
    publishPost(post);
    navigation.replace('PostDetail', { postId: post.id });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <NavHeader title="Share to feed" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <CoverBlock themes={themes} height={130} style={styles.cover}>
          <View style={styles.coverTag}>
            <Text style={styles.coverTagText}>
              {city} · {themes.map((t) => categoryLabels[t]).join(' · ')}
            </Text>
          </View>
        </CoverBlock>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Name your day out"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Say something about it</Text>
        <TextInput
          style={styles.blurbInput}
          value={blurb}
          onChangeText={setBlurb}
          placeholder="What made this day good? Any tips?"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Text style={styles.label}>Who can see this</Text>
        <View style={styles.segRow}>
          <Seg
            icon="earth"
            label="Everyone"
            active={visibility === 'public'}
            onPress={() => setVisibility('public')}
          />
          <Seg
            icon="account-group-outline"
            label="Followers"
            active={visibility === 'followers'}
            onPress={() => setVisibility('followers')}
          />
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {stops.length} stops · {formatDuration(durationMin)} · about {formatUsd(costUsd)}
          </Text>
        </View>
        <View style={styles.stops}>
          {stops.map((s, i) => (
            <View key={s.id} style={styles.stopRow}>
              <TimelineNode categories={s.categories} label={String(i + 1)} />
              <Text style={styles.stopName} numberOfLines={1}>
                {s.name}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.publishBtn,
            !canPublish && styles.publishDisabled,
            pressed && canPublish && styles.publishPressed,
          ]}
          disabled={!canPublish}
          onPress={publish}
        >
          <MaterialCommunityIcons name="send-outline" size={18} color="#FFFFFF" />
          <Text style={styles.publishText}>Publish to feed</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Seg({
  icon,
  label,
  active,
  onPress,
}: {
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]}>
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={active ? colors.textPrimary : colors.textSecondary}
      />
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  cover: { marginTop: 4 },
  coverTag: { padding: 12 },
  coverTagText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, paddingTop: 20, paddingBottom: 8 },
  titleInput: {
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceInput,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  blurbInput: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceInput,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  segRow: { flexDirection: 'row', backgroundColor: colors.surfaceInput, borderRadius: 12, padding: 3 },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  segText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  segTextActive: { color: colors.textPrimary },
  summary: { paddingTop: 20, paddingBottom: 4 },
  summaryText: { fontSize: 13, color: colors.textMuted },
  stops: { paddingTop: 10, gap: 10 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  publishDisabled: { backgroundColor: colors.borderStrong },
  publishPressed: { opacity: 0.9 },
  publishText: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
});
