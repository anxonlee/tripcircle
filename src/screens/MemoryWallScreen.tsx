import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import MapView from 'react-native-maps';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapStamp } from '../components/MapStamp';
import { WallPlaceCard } from '../components/WallPlaceCard';
import { buildWallCards } from '../domain/diary';
import { CARD_H, CARD_W, fitTransform, focusTransform, layoutWall } from '../lib/wallLayout';
import type { RootStackParamList } from '../navigation';
import type { CuratedPlace } from '../domain/types';
import { listPlacesForHistory } from '../services/places';
import { SEED_REGION } from '../services/mock/bayAreaPlaces';
import { useDiaryStore } from '../store/useDiaryStore';
import { colors } from '../theme/colors';

/**
 * Stamp size by zoom, keyed off the visible longitude span.
 *
 * A marker keeps its pixel size whatever the zoom, so at city scale a 108pt
 * polaroid covers roughly 2.7 km of ground and neighbours in one district
 * bury each other. Shrinking with the map keeps them legible without
 * clustering, and the name chip is dropped first — it is the widest part and
 * the least useful when a dozen are on screen.
 *
 * Tiers rather than a continuous scale: a marker rendered from a React view
 * only re-rasterises when it remounts, so every distinct size costs a remount
 * of every stamp. Four steps is enough to read as smooth.
 */
const STAMP_TIERS = [
  // Retuned for the Bay: these are longitude deltas, and a degree of
  // longitude is 87.7km at San Francisco's latitude against 102.7km at Hong
  // Kong's, so the inherited numbers framed about 15% less ground than they
  // were calibrated to.
  //
  // Sized against measured spacing rather than a round number. Among the 143
  // seed places inside the city the median nearest neighbour is 384m and the
  // closest quarter are within 197m. A full-size stamp occupies roughly 108
  // of ~390pt of width, so at a 0.05 span its slot covers 1.2km — three times
  // the median gap, and the name chips stack. 0.012 puts the slot under 300m,
  // which clears the median and most of the tail.
  { maxLonDelta: 0.012, scale: 1, showName: true },
  // 0.045 frames one district (the Mission is the widest at 0.046) and 0.14
  // frames the city (0.126 across). Past that is the regional view, where the
  // seed data spans 0.53 degrees from Mountain View to Berkeley.
  { maxLonDelta: 0.045, scale: 0.7, showName: false },
  { maxLonDelta: 0.14, scale: 0.5, showName: false },
  { maxLonDelta: Infinity, scale: 0.38, showName: false },
] as const;

function stampTier(lonDelta: number) {
  return STAMP_TIERS.find((t) => lonDelta <= t.maxLonDelta) ?? STAMP_TIERS[3];
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
/** Scale the canvas settles at when auto-focusing a freshly dropped card. */
const FOCUS_SCALE = 1;

/**
 * The memory wall (PRD §3A.3, FD3) — deliberately not a feed.
 *
 * Two views of the same visits. The map is home: every stamp sits on the
 * coordinates where it happened, which is the version that answers "where
 * have I been". The board is a toggle away — a zoomable canvas clustered by
 * district, where the cards are big enough to carry their notes. Geography in
 * one, the writing in the other; a 62px polaroid cannot do both.
 *
 * Stamping drops a new card with a short settle animation and the canvas
 * focuses it: PRD §3A.7 is explicit that the reward is the memory landing on
 * the wall, so that moment gets the animation and nothing else does. No
 * streak counter, no nagging, no "you've been a homebody".
 */
/** `embedded` when hosted inside the diary tab, which owns the top inset. */
export function MemoryWallScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const visits = useDiaryStore((s) => s.visits);
  const lastStampedVisitId = useDiaryStore((s) => s.lastStampedVisitId);
  const clearLastStamped = useDiaryStore((s) => s.clearLastStamped);

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // The map is the wall's home view: a memory means more sitting where it
  // happened. The board stays a toggle away for reading the notes.
  const [showMap, setShowMap] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lonDelta, setLonDelta] = useState(SEED_REGION.longitudeDelta);
  const mapRef = useRef<MapView>(null);

  const tier = stampTier(lonDelta);

  /**
   * Through the service rather than the seed list. A stamp against a place
   * the user added themselves was landing nowhere: the visit saved, the wall
   * could not resolve it, and the card simply never appeared -- which reads
   * as the diary having lost it.
   */
  const [places, setPlaces] = useState<CuratedPlace[]>([]);
  const [placesLoaded, setPlacesLoaded] = useState(false);
  useEffect(() => {
    listPlacesForHistory().then((all) => {
      setPlaces(all);
      setPlacesLoaded(true);
    });
  }, []);

  const cards = useMemo(() => buildWallCards(places, visits), [places, visits]);
  const selected = useMemo(
    () => cards.find((c) => c.place.id === selectedId) ?? null,
    [cards, selectedId]
  );
  const layout = useMemo(() => layoutWall(cards), [cards]);

  // Canvas transform. Committed values live alongside so a gesture can
  // resume from where the last one ended rather than snapping back.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  /** The card just stamped, if it is on the board. */
  const freshCard = useMemo(() => {
    if (!lastStampedVisitId) return null;
    const visit = visits.find((v) => v.id === lastStampedVisitId);
    if (!visit) return null;
    return layout.cards.find((c) => c.card.place.id === visit.placeId) ?? null;
  }, [lastStampedVisitId, visits, layout]);

  const applyFit = React.useCallback(() => {
    // In map mode "fit" means frame every stamp, not the board.
    if (showMap) {
      if (cards.length === 0) return;
      // One stamp has no extent, so fitToCoordinates zooms to the building.
      // Frame a neighbourhood around it instead.
      if (cards.length === 1) {
        mapRef.current?.animateToRegion(
          { ...cards[0].place.location, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          300
        );
        return;
      }
      mapRef.current?.fitToCoordinates(
        cards.map((c) => c.place.location),
        {
          edgePadding: { top: 90, left: 70, right: 70, bottom: 150 },
          animated: true,
        }
      );
      return;
    }
    if (viewport.width === 0 || layout.width === 0) return;
    const t = fitTransform(layout, viewport);
    scale.value = withTiming(t.scale, { duration: 260 });
    translateX.value = withTiming(t.translateX, { duration: 260 });
    translateY.value = withTiming(t.translateY, { duration: 260 });
    savedScale.value = t.scale;
    savedX.value = t.translateX;
    savedY.value = t.translateY;
  }, [showMap, cards, layout, viewport, scale, translateX, translateY, savedScale, savedX, savedY]);

  // Frame the board on first measure, and whenever the board grows while the
  // user is not the one who caused it.
  useEffect(() => {
    if (viewport.width > 0 && layout.width > 0 && !freshCard) applyFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height, layout.width, layout.height]);

  // Drop-and-settle: pan the canvas to the new card, then let it settle.
  const dropProgress = useSharedValue(0);
  useEffect(() => {
    if (!freshCard || viewport.width === 0) return;
    const t = focusTransform(freshCard, viewport, FOCUS_SCALE);
    scale.value = withSpring(t.scale, { damping: 18, stiffness: 140 });
    translateX.value = withSpring(t.translateX, { damping: 18, stiffness: 140 });
    translateY.value = withSpring(t.translateY, { damping: 18, stiffness: 140 });
    savedScale.value = t.scale;
    savedX.value = t.translateX;
    savedY.value = t.translateY;

    dropProgress.value = 0;
    dropProgress.value = withSpring(1, { damping: 12, stiffness: 120 });

    const timer = setTimeout(clearLastStamped, 1400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshCard, viewport.width, viewport.height]);

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
      // Keep the pinch focal point anchored: the board point under the
      // fingers must not slide while the scale changes.
      const k = next / savedScale.value;
      scale.value = next;
      translateX.value = e.focalX - (e.focalX - savedX.value) * k;
      translateY.value = e.focalY - (e.focalY - savedY.value) * k;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      const next = scale.value > 0.8 ? MIN_SCALE * 2 : 1;
      scale.value = withTiming(next, { duration: 200 });
      savedScale.value = next;
    });

  const gesture = Gesture.Simultaneous(pan, pinch, doubleTap);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport({ width, height });
  };

  // ——— Empty board: the day-one state ———
  // Held back until the places are in. Otherwise a wall with visits on it
  // shows "stamp a place and it lands here" for a frame, which tells the one
  // person who has been stamping that their diary is gone.
  if (cards.length === 0 && (placesLoaded || visits.length === 0)) {
    return (
      <View style={[styles.screen, { paddingTop: embedded ? 0 : insets.top }]}>
        <Header showMap={showMap} onToggleMap={() => setShowMap((v) => !v)} onFit={applyFit} />
        <View style={styles.empty}>
          <MaterialCommunityIcons
            name="bookmark-outline"
            size={26}
            color={colors.textMuted}
          />
          <Text style={styles.emptyText}>
            Stamp a place you have been and it lands here.
          </Text>
          <Pressable
            style={styles.emptyAction}
            onPress={() => navigation.navigate('Stamp')}
          >
            <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.emptyActionText}>Stamp a place</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: embedded ? 0 : insets.top }]}>
      <Header showMap={showMap} onToggleMap={() => setShowMap((v) => !v)} onFit={applyFit} />

      {showMap ? (
        <View style={styles.flex}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={SEED_REGION}
            // Frame the stamps on open rather than trusting SEED_REGION, whose
            // landscape shape makes a portrait viewport zoom out to the bay.
            onMapReady={applyFit}
            onRegionChangeComplete={(r) => setLonDelta(r.longitudeDelta)}
            /**
             * A marker tap fires this too, which is what made stamps look
             * untappable: the marker set the selection and this cleared it a
             * moment later. Only dismiss on a genuine background press.
             */
            onPress={(e) => {
              if (e.nativeEvent.action !== 'marker-press') setSelectedId(null);
            }}
          >
            {cards.map((c) => (
              <MapStamp
                // Tier in the key: a custom marker view only re-rasterises
                // on remount, so a size change has to remount it.
                key={`${c.place.id}-${tier.scale}`}
                card={c}
                scale={tier.scale}
                showName={tier.showName}
                onPress={() => setSelectedId(c.place.id)}
              />
            ))}
          </MapView>
          {selected && (
            <View style={[styles.detail, { paddingBottom: insets.bottom + 10 }]}>
              <Text style={styles.detailName} numberOfLines={1}>
                {selected.place.name}
              </Text>
              <Text style={styles.detailMeta} numberOfLines={1}>
                {selected.place.district}
                {selected.stats.visitCount > 1
                  ? ` · ${selected.stats.visitCount} visits`
                  : ''}
              </Text>
              {selected.latestVisit.note ? (
                <Text style={styles.detailNote} numberOfLines={3}>
                  {selected.latestVisit.note}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      ) : (
        <GestureDetector gesture={gesture}>
          <View style={styles.flex} onLayout={onLayout}>
            <Animated.View style={[styles.canvas, canvasStyle]}>
              {layout.clusters.map((cluster) => (
                <Text
                  key={cluster.district}
                  style={[
                    styles.districtLabel,
                    { left: cluster.labelX, top: cluster.labelY },
                  ]}
                >
                  {cluster.district}
                </Text>
              ))}
              {layout.cards.map((pc) => (
                <CardSlot
                  key={pc.card.place.id}
                  x={pc.x}
                  y={pc.y}
                  tilt={pc.tilt}
                  isFresh={freshCard?.card.place.id === pc.card.place.id}
                  dropProgress={dropProgress}
                >
                  <WallPlaceCard card={pc.card} />
                </CardSlot>
              ))}
            </Animated.View>
          </View>
        </GestureDetector>
      )}
    </View>
  );
}

/**
 * A card's position on the board. The freshly stamped card drops in — scaling
 * down from slightly above with a spring — while every other card renders
 * statically. Only the new memory moves.
 */
function CardSlot({
  x,
  y,
  tilt,
  isFresh,
  dropProgress,
  children,
}: {
  x: number;
  y: number;
  tilt: number;
  isFresh: boolean;
  dropProgress: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    if (!isFresh) {
      return {
        transform: [{ rotate: `${tilt}deg` }],
        opacity: 1,
      };
    }
    const p = dropProgress.value;
    return {
      opacity: Math.min(1, p * 2),
      transform: [
        { translateY: (1 - p) * -28 },
        { scale: 1 + (1 - p) * 0.18 },
        { rotate: `${tilt * p}deg` },
      ],
    };
  }, [isFresh, tilt]);

  return (
    <Animated.View
      style={[styles.cardSlot, { left: x, top: y, width: CARD_W, height: CARD_H }, style]}
    >
      {children}
    </Animated.View>
  );
}

function Header({
  showMap,
  onToggleMap,
  onFit,
}: {
  showMap: boolean;
  onToggleMap: () => void;
  onFit: () => void;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Your places</Text>
      <View style={styles.headerActions}>
        <Pressable style={styles.iconButton} onPress={onFit} hitSlop={8}>
          <MaterialCommunityIcons
            name="fit-to-screen-outline"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onToggleMap} hitSlop={8}>
          <MaterialCommunityIcons
            name={showMap ? 'view-dashboard-outline' : 'map-outline'}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceAlt },
  /** The note a 62px polaroid cannot show, for the tapped stamp. */
  detail: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    gap: 3,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  detailName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  detailMeta: { fontSize: 12, color: colors.textSecondary },
  detailNote: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  flex: { flex: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
    backgroundColor: colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  headerActions: { flexDirection: 'row', gap: 6 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInput,
  },
  canvas: { position: 'absolute', left: 0, top: 0 },
  cardSlot: { position: 'absolute' },
  districtLabel: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  emptyActionText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
});
