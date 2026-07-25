import type { Landmark } from '../../domain/types';

/**
 * Public landmarks offered as start places (PRD §3.1 landmark-first:
 * stations and plazas, never home addresses).
 */
export const bayAreaLandmarks: Landmark[] = [
  { id: 'lm-powell-station', name: 'Powell St Station', kind: 'station', location: { latitude: 37.7844, longitude: -122.4079 } },
  { id: 'lm-embarcadero-station', name: 'Embarcadero Station', kind: 'station', location: { latitude: 37.7929, longitude: -122.3968 } },
  { id: 'lm-montgomery-station', name: 'Montgomery St Station', kind: 'station', location: { latitude: 37.7894, longitude: -122.4013 } },
  { id: 'lm-civic-center-station', name: 'Civic Center Station', kind: 'station', location: { latitude: 37.7796, longitude: -122.4136 } },
  { id: 'lm-16th-mission-station', name: '16th St Mission Station', kind: 'station', location: { latitude: 37.7650, longitude: -122.4197 } },
  { id: 'lm-24th-mission-station', name: '24th St Mission Station', kind: 'station', location: { latitude: 37.7522, longitude: -122.4187 } },
  { id: 'lm-caltrain-4th-king', name: 'Caltrain — 4th & King', kind: 'station', location: { latitude: 37.7766, longitude: -122.3947 } },
  { id: 'lm-ferry-plaza', name: 'Ferry Building Plaza', kind: 'plaza', location: { latitude: 37.7955, longitude: -122.3937 } },
  { id: 'lm-union-square', name: 'Union Square', kind: 'plaza', location: { latitude: 37.7880, longitude: -122.4075 } },
  { id: 'lm-ghirardelli-square', name: 'Ghirardelli Square', kind: 'plaza', location: { latitude: 37.8058, longitude: -122.4229 } },
  { id: 'lm-dolores-park', name: 'Dolores Park', kind: 'park', location: { latitude: 37.7596, longitude: -122.4269 } },
  { id: 'lm-golden-gate-park', name: 'Golden Gate Park — Music Concourse', kind: 'park', location: { latitude: 37.7699, longitude: -122.4683 } },
  { id: 'lm-downtown-berkeley', name: 'Downtown Berkeley Station', kind: 'station', location: { latitude: 37.8700, longitude: -122.2680 } },
  { id: 'lm-19th-oakland', name: '19th St Oakland Station', kind: 'station', location: { latitude: 37.8074, longitude: -122.2688 } },
];
