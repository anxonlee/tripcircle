import { config } from '../../config';

/**
 * Single choke point for Google Maps Platform calls. Routing every request
 * through here means the key (or the proxy that replaces it) is referenced in
 * exactly one file.
 */
export function googleUrl(path: string, params: Record<string, string>): string {
  const base = config.googleProxyUrl || 'https://maps.googleapis.com';
  const qs = new URLSearchParams(params);
  // With a proxy, the backend attaches the key; never send it from the client.
  if (!config.googleProxyUrl) qs.set('key', config.googleMapsApiKey);
  return `${base}${path}?${qs.toString()}`;
}

/** Headers for the Places API (New), which authenticates per-request. */
export function placesHeaders(fieldMask: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Goog-FieldMask': fieldMask,
  };
  if (!config.googleProxyUrl) headers['X-Goog-Api-Key'] = config.googleMapsApiKey;
  return headers;
}

export function placesEndpoint(path: string): string {
  const base = config.googleProxyUrl || 'https://places.googleapis.com';
  return `${base}${path}`;
}

/** fetch with a timeout so a hung request can't freeze a screen. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 8000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`Google API ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
