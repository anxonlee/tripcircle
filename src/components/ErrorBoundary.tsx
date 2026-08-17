import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { appBuildMeta } from '../lib/appMeta';
import { formatReport, trimStack } from '../lib/crashReport';
import { recordCrash } from '../services/crashLog';
import { colors } from '../theme/colors';

/**
 * Catches render errors so a crash is reportable instead of a white screen.
 *
 * There is no crash reporting service (PRD §10 / the privacy policy commits
 * to none), so the screen itself has to be the bug report: it shows the
 * actual error and component stack, selectable, for a tester to screenshot.
 * A generic "something went wrong" would leave us with nothing to act on.
 *
 * A screenshot was the whole plan, and it was a bad one: it loses the stack
 * below the fold, it cannot be searched, and it asks someone to photograph
 * text rather than send it. The crash is now also written down and offered
 * to the share sheet, so the report leaves as text — and stays in Settings
 * if they close the app before sending, which is what people do when
 * something has just broken.
 *
 * The diary is safe either way — visits live in AsyncStorage, not in React
 * state — so the copy says so. A crash that looks like data loss will get
 * reported as data loss.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Goes to the device log, which `npx expo run:ios` surfaces during a
    // local run and Console.app shows for a TestFlight build.
    console.error('[PIRT] render error', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
    void recordCrash({
      at: new Date().toISOString(),
      source: 'render',
      fatal: true,
      message: `${error.name}: ${error.message}`,
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
    });
  }

  private reset = () => this.setState({ error: null, componentStack: null });

  /**
   * Sends this one crash, not the stored log — the user is looking at it,
   * and reading back five is a Settings job. Built from state rather than
   * from storage so it works even if the write failed.
   */
  private send = () => {
    const { error, componentStack } = this.state;
    if (!error) return;
    void Share.share({
      message: formatReport(
        [
          {
            at: new Date().toISOString(),
            source: 'render',
            fatal: true,
            message: `${error.name}: ${error.message}`,
            stack: error.stack ?? null,
            componentStack,
          },
        ],
        appBuildMeta()
      ),
    });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={28}
            color={colors.textSecondary}
          />
          <Text style={styles.title}>PIRT hit a problem</Text>
          <Text style={styles.body}>
            Your diary is safe — visits are saved on this device and nothing
            here has been lost. Send the report over, then try again.
          </Text>

          <View style={styles.detail}>
            <Text selectable style={styles.detailText}>
              {error.name}: {error.message}
            </Text>
            {/*
              Four frames, shortened. Eight full ones ran to several screens
              on a dev bundle and pushed both buttons out of reach, which
              made the detail actively worse than no detail: the whole point
              of the screen is the action at the bottom of it.
            */}
            {componentStack ? (
              <Text selectable style={styles.stack}>
                {trimStack(componentStack, 4).join('\n')}
              </Text>
            ) : null}
          </View>

          {/*
            Send sits above Try again, because trying again is what loses the
            report: the screen goes, and with it the only prompt anyone gets
            to tell us what happened. It is stored either way, but a person
            who has recovered is a person who no longer files bugs.
          */}
          <Pressable style={styles.action} onPress={this.send}>
            <MaterialCommunityIcons name="tray-arrow-up" size={16} color="#FFFFFF" />
            <Text style={styles.actionText}>Send the report</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={this.reset}>
            <Text style={styles.secondaryText}>Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: '500', color: colors.textPrimary },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  detail: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceInput,
    gap: 6,
  },
  detailText: { fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
  stack: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  action: {
    marginTop: 8,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  secondary: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
});
