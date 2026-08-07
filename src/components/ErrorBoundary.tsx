import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Catches render errors so a crash is reportable instead of a white screen.
 *
 * There is no crash reporting service (PRD §10 / the privacy policy commits
 * to none), so the screen itself has to be the bug report: it shows the
 * actual error and component stack, selectable, for a tester to screenshot.
 * A generic "something went wrong" would leave us with nothing to act on.
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
  }

  private reset = () => this.setState({ error: null, componentStack: null });

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
            here has been lost. Screenshot this screen and send it over, then
            try again.
          </Text>

          <View style={styles.detail}>
            <Text selectable style={styles.detailText}>
              {error.name}: {error.message}
            </Text>
            {componentStack ? (
              <Text selectable style={styles.stack}>
                {componentStack.trim().split('\n').slice(0, 8).join('\n')}
              </Text>
            ) : null}
          </View>

          <Pressable style={styles.action} onPress={this.reset}>
            <Text style={styles.actionText}>Try again</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
});
