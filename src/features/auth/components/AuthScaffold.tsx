/**
 * AuthScaffold — shared shell for the auth screens.
 *
 * Layout: an optional header row (the OTP screen's back + title), then the
 * screen's content passed as children. Screens compose their own Cards —
 * the phone/OTP designs stack several white cards on the page, so the
 * scaffold doesn't own one. Handles safe areas, keyboard avoidance, and
 * scrolling so each screen only describes its own fields.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../../../theme';

type Props = {
  /** Row above the content — the OTP screen's back + title. */
  header?: ReactNode;
  /** The screen's cards/content. */
  children: ReactNode;
};

export function AuthScaffold({ header, children }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* RN 0.87 removed StatusBar backgroundColor — the root View paints it. */}
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {header ? <View style={styles.header}>{header}</View> : null}

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s6,
    paddingBottom: spacing.s8,
  },
  header: {
    marginBottom: spacing.s5,
  },
});
