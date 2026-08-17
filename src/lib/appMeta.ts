import Constants from 'expo-constants';

/**
 * Which build the user is actually running.
 *
 * Read from the binary (`nativeAppVersion`/`nativeBuildVersion` come from
 * Info.plist) rather than from app.json, because the build number in app.json
 * is not the one that shipped: EAS increments it remotely at build time, so
 * the checked-in value is always stale and would have every report from every
 * TestFlight build claim the same number.
 *
 * Falls back to the manifest, then to a visible placeholder. A report that
 * says "unknown" is a nuisance; one that silently claims the wrong build
 * sends someone hunting a bug in the wrong code.
 */
export function appBuildMeta(): { version: string; build: string } {
  const version =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown';
  const build =
    Constants.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    'dev';
  return { version, build };
}
