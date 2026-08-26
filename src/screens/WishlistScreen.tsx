import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CuratedPlace } from '../domain/types';
import { serverMessage as message } from '../lib/serverError';
import { DATASET_CITY } from '../lib/tripLink';
import type { RootStackParamList } from '../navigation';
import { placesService } from '../services/places';
import {
  addItem,
  deleteWishlist,
  leaveWishlist,
  listItems,
  listMembers,
  listWishlists,
  removeItem,
  rotateInviteCode,
  type Wishlist,
  type WishlistItem,
  type WishlistMember,
} from '../services/wishlists';
import { useAuthStore } from '../store/useAuthStore';
import { useTripStore } from '../store/useTripStore';
import { colors } from '../theme/colors';


type Props = NativeStackScreenProps<RootStackParamList, 'Wishlist'>;

/**
 * One shared list: what is on it, who else is on it, and how to invite them.
 *
 * A list is a holding pen, not a plan — places sit here until somebody turns
 * them into a day. That is why the main action is "put these in a day"
 * rather than anything that tries to schedule from here: the planner already
 * knows how, and a second way to order a day would be a second answer.
 */
export function WishlistScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const session = useAuthStore((s) => s.session);
  const setSelection = useTripStore((s) => s.setSelection);

  const [list, setList] = useState<Wishlist | null>(null);
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [members, setMembers] = useState<WishlistMember[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CuratedPlace[]>([]);
  const [busy, setBusy] = useState(false);

  /*
   * Both sides have to exist. `list?.ownerId === session?.user.id` is true
   * when both are undefined — a signed-out person looking at a list that
   * has not loaded was being offered "Delete this list".
   */
  const isOwner = Boolean(list && session && list.ownerId === session.user.id);

  const refresh = useCallback(async () => {
    try {
      const all = await listWishlists();
      setList(all.find((l) => l.id === route.params.id) ?? null);
      setItems(await listItems(route.params.id));
      setMembers(await listMembers(route.params.id));
    } catch (e) {
      Alert.alert('Could not load that list', message(e));
    }
  }, [route.params.id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    void placesService.searchPlaces(q).then((found) => {
      if (alive) setResults(found.slice(0, 6));
    });
    return () => {
      alive = false;
    };
  }, [query]);

  const add = async (place: CuratedPlace) => {
    if (!session) return;
    setQuery('');
    setResults([]);
    try {
      await addItem({
        wishlistId: route.params.id,
        placeId: place.id,
        placeName: place.name,
        addedBy: session.user.id,
      });
      await refresh();
    } catch (e) {
      Alert.alert('Could not add that', message(e));
    }
  };

  /**
   * The handover into planning.
   *
   * Replaces the selection rather than adding to it, and says so first: the
   * Plan tab holds one day at a time, and quietly merging a shared list into
   * whatever someone had chosen would produce a day neither person picked.
   *
   * Places this build cannot resolve are dropped here rather than carried as
   * ids the planner would silently ignore — and the count is named, because
   * a day two stops short with no explanation reads as the sender's mistake.
   */
  const planThese = async () => {
    if (!items || items.length === 0) return;
    const all = await placesService.listPlaces();
    const known = new Set(all.map((p) => p.id));
    const usable = items.filter((i) => known.has(i.placeId));
    const missing = items.length - usable.length;
    if (usable.length === 0) {
      Alert.alert(
        'Nothing here this build knows',
        'None of these places are in your copy of the app, so there is nothing to plan yet.'
      );
      return;
    }
    Alert.alert(
      'Plan these places?',
      [
        `${usable.length} ${usable.length === 1 ? 'place goes' : 'places go'} to the Plan tab.`,
        missing > 0
          ? `${missing} ${missing === 1 ? 'is' : 'are'} not in your places and will be left out.`
          : null,
        'This replaces whatever you had selected.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Plan them',
          onPress: () => {
            setSelection(usable.map((i) => i.placeId));
            navigation.navigate('Tabs', { screen: 'Plan' });
          },
        },
      ]
    );
  };

  const shareInvite = () => {
    if (!list?.inviteCode) return;
    void Share.share({
      message: `Join "${list.name}" on PIRT with this code: ${list.inviteCode}`,
    });
  };

  const rotate = () => {
    Alert.alert(
      'Get a new code?',
      'The code you have already sent stops working. Anyone already on the list stays on it.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'New code',
          style: 'destructive',
          onPress: async () => {
            try {
              await rotateInviteCode(route.params.id);
              await refresh();
            } catch (e) {
              Alert.alert('Could not change the code', message(e));
            }
          },
        },
      ]
    );
  };

  const removeSelf = () => {
    Alert.alert('Leave this list?', 'What you added stays on it.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (!session) return;
          setBusy(true);
          try {
            await leaveWishlist(route.params.id, session.user.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not leave', message(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const destroy = () => {
    Alert.alert(
      'Delete this list?',
      'It goes for everyone on it, along with everything they added.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteWishlist(route.params.id);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Could not delete it', message(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

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
        <Text style={styles.title} numberOfLines={1}>
          {list?.name ?? 'List'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {/*
          A list built against a different place dataset. Its ids mean
          nothing here, so the places would arrive nameless or not at all —
          said once, at the top, rather than left to be inferred from a list
          that mostly does not work.
        */}
        {list && list.city !== DATASET_CITY && (
          <Text style={styles.foreign}>
            This list was made in another city ({list.city}), so its places
            are not in your copy of PIRT.
          </Text>
        )}

        {members.length > 0 && (
          <Text style={styles.who}>
            {members.map((m) => m.displayName).join(' · ')}
          </Text>
        )}

        {items === null ? (
          <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
        ) : items.length === 0 ? (
          <Text style={styles.body}>
            Nothing on this list yet. Search below to put a place on it —
            whoever else is here will see it.
          </Text>
        ) : (
          items.map((i) => (
            <View key={i.id} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>
                {i.placeName}
              </Text>
              <Pressable
                onPress={async () => {
                  try {
                    await removeItem(i.id);
                    await refresh();
                  } catch (e) {
                    Alert.alert('Could not remove that', message(e));
                  }
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Take ${i.placeName} off the list`}
              >
                <MaterialCommunityIcons name="close" size={15} color={colors.textMuted} />
              </Pressable>
            </View>
          ))
        )}

        <TextInput
          style={styles.input}
          placeholder="Add a place"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {results.map((p) => (
          <Pressable key={p.id} style={styles.result} onPress={() => void add(p)}>
            <MaterialCommunityIcons name="plus" size={15} color={colors.accent} />
            <Text style={styles.resultName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.resultDistrict}>{p.district}</Text>
          </Pressable>
        ))}

        {items !== null && items.length > 0 && (
          <Pressable style={styles.primary} onPress={planThese}>
            <MaterialCommunityIcons name="map-outline" size={16} color="#FFFFFF" />
            <Text style={styles.primaryText}>Put these in a day</Text>
          </Pressable>
        )}

        {isOwner && list?.inviteCode && (
          <View style={styles.inviteBox}>
            <Text style={styles.sectionTitle}>Invite</Text>
            <Text style={styles.code}>{list.inviteCode}</Text>
            {/*
              Said plainly: the code is the permission. Anyone who ends up
              with it can join, which is the same bargain every share link
              makes and is worth knowing before forwarding it.
            */}
            <Text style={styles.note}>
              Anyone with this code can join the list. Change it and the old
              one stops working.
            </Text>
            <View style={styles.inviteRow}>
              <Pressable style={styles.secondary} onPress={shareInvite}>
                <Text style={styles.secondaryText}>Send the code</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={rotate}>
                <Text style={styles.secondaryText}>New code</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Pressable
          style={styles.destructive}
          disabled={busy}
          onPress={isOwner ? destroy : removeSelf}
        >
          <Text style={styles.destructiveText}>
            {isOwner ? 'Delete this list' : 'Leave this list'}
          </Text>
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
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  content: { padding: 16, gap: 11 },
  spinner: { marginTop: 24 },
  who: { fontSize: 12, color: colors.textMuted },
  foreign: { fontSize: 12, color: colors.warning, lineHeight: 17 },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  sectionTitle: { fontSize: 12, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  rowName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  input: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceInput,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 6,
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  resultName: { flex: 1, fontSize: 13, color: colors.textPrimary },
  resultDistrict: { fontSize: 11, color: colors.textMuted },
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
  inviteBox: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    gap: 8,
  },
  code: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  note: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  inviteRow: { flexDirection: 'row', gap: 9 },
  secondary: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  destructive: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  destructiveText: { fontSize: 13, color: colors.warning },
});
