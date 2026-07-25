/**
 * Build-time configuration.
 *
 * `EXPO_PUBLIC_*` vars are inlined into the JS bundle by Expo, which means
 * anything here ships inside the app and is extractable. That is acceptable
 * for a Maps Platform key ONLY when the key is locked down in Google Cloud
 * (API restrictions + quota caps + budget alerts) — see docs/providers.md.
 *
 * `googleProxyUrl` is the escape hatch: point it at your own backend later and
 * the key leaves the client entirely, with no other code changes.
 */
const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const proxy = process.env.EXPO_PUBLIC_GOOGLE_PROXY_URL ?? '';

export const config = {
  googleMapsApiKey: key,
  googleProxyUrl: proxy,
  /** Real providers switch on only when we have a way to reach Google. */
  useRealProviders: key.length > 0 || proxy.length > 0,
} as const;
