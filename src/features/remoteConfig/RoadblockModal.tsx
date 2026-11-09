import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../../theme';

interface RoadblockModalProps {
  children: ReactNode;
  /** Android back. Force update exits the app; subscription does nothing. */
  onRequestClose: () => void;
  testID: string;
}

/**
 * Card over a dimmed app (UX-app-roadblocks, Presentation). No close button,
 * and taps on the scrim do nothing: the card's own buttons are the only way
 * out. The native modal also stops touches reaching the app behind it.
 */
export function RoadblockModal({ children, onRequestClose, testID }: RoadblockModalProps) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
      onRequestClose={onRequestClose}>
      <View style={styles.scrim} testID={testID}>
        <View style={styles.card}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s6,
    paddingVertical: spacing.s8,
    backgroundColor: colors.scrim,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.s4,
    padding: spacing.s6,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceCard,
    ...shadow.md,
  },
});
