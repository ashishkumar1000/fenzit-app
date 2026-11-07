import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, palette, spacing, typography } from '../theme';
import { recordCrash } from '../services/telemetry';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * Last-resort boundary for the whole app. A render error shows a plain
 * message instead of a blank screen, and the error goes to Crashlytics
 * (React catches render errors, so the global JS handler never sees them).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    recordCrash(error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong.</Text>
        <Text style={styles.body}>Close the app and open it again.</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.s6,
    backgroundColor: palette.gray50,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.s2,
    textAlign: 'center',
  },
});
