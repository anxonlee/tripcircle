import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Category, Landmark, TransportMode } from '../domain/types';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const categoryIcon: Record<Category, IconName> = {
  food: 'silverware-fork-knife',
  historical: 'bank',
  shopping: 'shopping',
  nature: 'tree',
  nightlife: 'glass-cocktail',
  cafe: 'coffee',
};

export const transportIcon: Record<TransportMode, IconName> = {
  walk: 'walk',
  transit: 'train',
  taxi: 'taxi',
};

export const transportLabel: Record<TransportMode, string> = {
  walk: 'Walk',
  transit: 'Transit',
  taxi: 'Taxi',
};

export const landmarkIcon: Record<Landmark['kind'], IconName> = {
  station: 'train',
  plaza: 'fountain',
  park: 'tree',
  landmark: 'map-marker',
};
