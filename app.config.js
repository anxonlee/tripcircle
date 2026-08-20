/**
 * Dynamic config layered over app.json.
 *
 * app.json stays the source of truth for everything static; this file exists
 * for the one value that cannot live there — the Android Google Maps key.
 *
 * Why it cannot live in app.json: on Android, react-native-maps draws with
 * Google's Maps SDK, which reads its key from the built AndroidManifest. A
 * key written into app.json would be committed to the repository. Writing
 * `process.env.SOMETHING` into app.json does not work either — prebuild
 * copies that text into the manifest verbatim and the map comes out blank,
 * which looks exactly like having no key at all and is a well-worn way to
 * lose an afternoon (expo/expo#40513).
 *
 * A config function is resolved by Node at build time, so the environment
 * variable is actually read. Set it as an EAS environment variable; see
 * docs/providers.md.
 *
 * Absent the variable, the key is left undefined rather than set to an empty
 * string. Expo then omits the manifest entry entirely, which is the same
 * state the project was in before this file existed: iOS unaffected, and
 * Android maps blank until a key is configured.
 *
 * iOS needs none of this. MapKit draws the map there and asks for nothing.
 */
module.exports = ({ config }) => {
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;

  return {
    ...config,
    android: {
      ...config.android,
      ...(androidMapsKey
        ? { config: { googleMaps: { apiKey: androidMapsKey } } }
        : {}),
    },
  };
};
