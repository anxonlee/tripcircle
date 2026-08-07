import type { District, LatLng } from './types';
import { haversineKm } from '../lib/geo';

/**
 * The district centroids every place was assigned against, nearest-first.
 *
 * Kept here rather than inlined into the migration that produced `district`
 * so the assignment stays reproducible: re-importing places means re-running
 * `nearestDistrict` over this table, not re-deriving a set of centroids from
 * memory and getting a subtly different answer.
 *
 * The set was tuned against the seed data's actual shape, not against a map.
 * San Francisco is split by neighbourhood because half the curated places sit
 * there; everywhere else is city-scale, because the imported coverage outside
 * the city is too sparse to divide honestly. Districts were added and merged
 * until no one of them held more than a quarter of the dataset — the largest,
 * Palo Alto, holds 17%. That cap matters twice over: the memory wall renders
 * one cluster per district, and the planner's district-affinity reason is
 * suppressed once it applies to more than 25% of candidates, so a single
 * dominant district would produce one enormous cluster and a reason that
 * never survives to be shown.
 */
export const DISTRICT_CENTROIDS: { district: District; location: LatLng }[] = [
  { district: 'Mission', location: { latitude: 37.7599, longitude: -122.4148 } },
  { district: 'Downtown & SoMa', location: { latitude: 37.786, longitude: -122.403 } },
  { district: 'North Beach', location: { latitude: 37.801, longitude: -122.409 } },
  { district: 'Marina', location: { latitude: 37.803, longitude: -122.437 } },
  { district: 'Castro & Haight', location: { latitude: 37.764, longitude: -122.44 } },
  { district: 'The Avenues', location: { latitude: 37.766, longitude: -122.482 } },
  { district: 'Sausalito', location: { latitude: 37.859, longitude: -122.485 } },
  { district: 'Berkeley', location: { latitude: 37.87, longitude: -122.27 } },
  { district: 'Oakland', location: { latitude: 37.8044, longitude: -122.2712 } },
  { district: 'Alameda', location: { latitude: 37.765, longitude: -122.245 } },
  { district: 'Hayward', location: { latitude: 37.67, longitude: -122.09 } },
  { district: 'Pacifica', location: { latitude: 37.6138, longitude: -122.4869 } },
  { district: 'Half Moon Bay', location: { latitude: 37.4636, longitude: -122.4286 } },
  { district: 'San Mateo', location: { latitude: 37.563, longitude: -122.3255 } },
  { district: 'Redwood City', location: { latitude: 37.485, longitude: -122.228 } },
  { district: 'Palo Alto', location: { latitude: 37.442, longitude: -122.143 } },
  { district: 'Mountain View', location: { latitude: 37.39, longitude: -122.08 } },
];

/**
 * The district a coordinate belongs to: nearest centroid, no boundaries.
 *
 * This is how every seed record got its `district`, and it is how a place
 * discovered through a live provider gets one too. Both paths must use this
 * function rather than their own judgment — a live provider that guessed
 * "Mission District" where the seed data says "Mission" would put two
 * clusters on the memory wall for one neighbourhood, which is precisely what
 * the closed `District` union exists to prevent.
 */
export function nearestDistrict(location: LatLng): District {
  let best = DISTRICT_CENTROIDS[0];
  let bestKm = haversineKm(location, best.location);
  for (const c of DISTRICT_CENTROIDS.slice(1)) {
    const km = haversineKm(location, c.location);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best.district;
}
