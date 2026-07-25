import * as Location from 'expo-location';
import type { LatLng } from '../domain/types';
import { snapToCoarse } from '../lib/geo';

/**
 * Device-location boundary. Everything the app knows about GPS comes through
 * here, so the privacy rules from PRD §3.1 live in one auditable place:
 *
 *  - coordinates are coarse-snapped (~100 m) before they leave this module,
 *    so no caller can accidentally hold a precise fix;
 *  - nothing is cached or written to storage here;
 *  - permission is requested only when the user taps the location action
 *    (never on launch).
 */
export type LocationResult =
  | { status: 'ok'; coords: LatLng }
  | { status: 'denied' }
  | { status: 'unavailable' };

export interface LocationService {
  getCurrentCoarse(): Promise<LocationResult>;
}

class ExpoLocationService implements LocationService {
  async getCurrentCoarse(): Promise<LocationResult> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { status: 'denied' };
      // Balanced accuracy is plenty: the fix is snapped to ~100 m anyway.
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        status: 'ok',
        coords: snapToCoarse({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      };
    } catch {
      return { status: 'unavailable' };
    }
  }
}

/** App-wide singleton. Swap the implementation here, nowhere else. */
export const locationService: LocationService = new ExpoLocationService();
