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
  muni: 'bus',
  bart: 'train',
  ferry: 'ferry',
  rideshare: 'car-lifted-pickup',
  drive: 'car',
};

export const transportLabel: Record<TransportMode, string> = {
  walk: 'Walk',
  muni: 'Muni',
  bart: 'BART',
  ferry: 'Ferry',
  rideshare: 'Rideshare',
  drive: 'Drive',
};

export const landmarkIcon: Record<Landmark['kind'], IconName> = {
  station: 'train',
  plaza: 'fountain',
  park: 'tree',
  landmark: 'map-marker',
};
