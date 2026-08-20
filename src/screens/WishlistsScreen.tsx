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
import { SignIn } from '../components/SignIn';
import type { RootStackParamList } from '../navigation';
import { serverMessage as message } from '../lib/serverError';
import { hasBackend } from '../services/supabase';
import {
  createWishlist,
  joinWishlist,
  listWishlists,
  type Wishlist,
} from '../services/wishlists';
import { useAuthStore } from '../store/useAuthStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Wishlists'>;

/** Set by `new_invite_code()` in the database. Ten characters, always. */
const INVITE_CODE_LENGTH = 10;

/**
 * Lists you share with other people (PRD F14, Phase 3).
 *
 * The only screen in the app that needs a network, and it says so when it
 * has not got one rather than spinning. Three states worth handling
 * separately: a build with no server at all, a person not signed in, and a
 * person with no lists yet — each is a different sentence, and collapsing
 * them into one empty state would tell two of the three something false.
 */
export function WishlistsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const displayName = useAuthStore((s) => s.displayName);

  const [lists, setLists] = useState<Wishlist[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (status !== 'signedIn') return;
    try {
      setLists(await listWishlists());
    } catch (e) {
      Alert.alert('Could not load your lists', message(e));
    }
  }, [status]);

  // On focus rather than on mount: someone else may have added a place while
  // this screen was in the background, and coming back to a stale list is
  // how a shared thing stops feeling shared.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const create = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const made = await createWishlist(name, session.user.id);
      setName('');
      await refresh();
      navigation.navigate('Wishlist', { id: made.id });
    } catch (e) {
      Alert.alert('Could not make that list', message(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      const id = await joinWishlist(code);
      setCode('');
      await refresh();
      navigation.navigate('Wishlist', { id });
    } catch (e) {
      Alert.alert('Could not join', message(e));
    } finally {
      setBusy(false);
    }
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
        <Text style={styles.title}>Shared lists</Text>
        <View style={styles.spacer} />
        {status === 'signedIn' && (
          <Pressable onPress={() => void signOut()} hitSlop={8}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {!hasBackend ? (
          <Text style={styles.body}>
            This build has no server configured, so shared lists are off.
            Everything else works exactly as it always has — the diary, the
            planner and sharing a day are all local.
          </Text>
        ) : status === 'loading' ? (
          <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
        ) : status === 'signedOut' ? (
          <SignIn />
        ) : (
          <>
            {displayName && (
              <Text style={styles.who}>Signed in as {displayName}</Text>
            )}

            {lists === null ? (
              <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
            ) : lists.length === 0 ? (
              <Text style={styles.body}>
                No lists yet. Make one and send the invite to whoever you are
                planning with, or join theirs with a code.
              </Text>
            ) : (
              lists.map((l) => (
                <Pressable
                  key={l.id}
                  style={styles.row}
                  onPress={() => navigation.navigate('Wishlist', { id: l.id })}
                >
                  <MaterialCommunityIcons
                    name="format-list-bulleted"
                    size={17}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {l.name}
                  </Text>
                  {l.ownerId === session?.user.id && (
                    <Text style={styles.rowTag}>yours</Text>
                  )}
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              ))
            )}

            <Text style={styles.sectionTitle}>Start a list</Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder="Saturday ideas"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                editable={!busy}
              />
              <Pressable
                style={[styles.addBtn, (!name.trim() || busy) && styles.addBtnOff]}
                disabled={!name.trim() || busy}
                onPress={create}
                accessibilityRole="button"
                accessibilityLabel="Make this list"
              >
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Join with a code</Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder="ABCDE12345"
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
              />
              <Pressable
                style={[
                  styles.addBtn,
                  (code.trim().length !== INVITE_CODE_LENGTH || busy) && styles.addBtnOff,
                ]}
                disabled={code.trim().length !== INVITE_CODE_LENGTH || busy}
                onPress={join}
                accessibilityRole="button"
                accessibilityLabel="Join this list"
              >
                <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
              </Pressable>
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
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  spacer: { flex: 1 },
  signOut: { fontSize: 13, color: colors.textSecondary },
  content: { padding: 16, gap: 12 },
  spinner: { marginTop: 24 },
  who: { fontSize: 12, color: colors.textMuted },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  sectionTitle: { fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
  },
  rowName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  rowTag: { fontSize: 11, color: colors.textMuted },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
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
});
