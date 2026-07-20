import type { Landmark } from '../../domain/types';

/**
 * Public landmarks offered as start places (PRD §3.1 landmark-first:
 * stations and plazas, never home addresses).
 */
export const tokyoLandmarks: Landmark[] = [
  { id: 'lm-shibuya-station', name: 'Shibuya Station', kind: 'station', location: { latitude: 35.6580, longitude: 139.7016 } },
  { id: 'lm-hachiko-plaza', name: 'Hachikō Plaza', kind: 'plaza', location: { latitude: 35.6591, longitude: 139.7005 } },
  { id: 'lm-shinjuku-station', name: 'Shinjuku Station', kind: 'station', location: { latitude: 35.6896, longitude: 139.7006 } },
  { id: 'lm-tokyo-station', name: 'Tokyo Station', kind: 'station', location: { latitude: 35.6812, longitude: 139.7671 } },
  { id: 'lm-ueno-station', name: 'Ueno Station', kind: 'station', location: { latitude: 35.7141, longitude: 139.7774 } },
  { id: 'lm-asakusa-station', name: 'Asakusa Station', kind: 'station', location: { latitude: 35.7119, longitude: 139.7983 } },
  { id: 'lm-ebisu-station', name: 'Ebisu Station', kind: 'station', location: { latitude: 35.6467, longitude: 139.7101 } },
  { id: 'lm-ikebukuro-station', name: 'Ikebukuro Station', kind: 'station', location: { latitude: 35.7295, longitude: 139.7109 } },
  { id: 'lm-ginza-crossing', name: 'Ginza 4-chōme Crossing', kind: 'plaza', location: { latitude: 35.6717, longitude: 139.7650 } },
  { id: 'lm-roppongi-crossing', name: 'Roppongi Crossing', kind: 'plaza', location: { latitude: 35.6627, longitude: 139.7315 } },
  { id: 'lm-nakameguro-station', name: 'Nakameguro Station', kind: 'station', location: { latitude: 35.6440, longitude: 139.6987 } },
  { id: 'lm-akihabara-station', name: 'Akihabara Station', kind: 'station', location: { latitude: 35.6984, longitude: 139.7731 } },
];
