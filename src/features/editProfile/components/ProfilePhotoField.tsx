/**
 * ProfilePhotoField — the person's own photo on the Edit profile page. The
 * photo is shown in a circle, so a non-square image is centre-cropped by the
 * display. The stored file is not cropped (see the spec).
 */
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, InlineError } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  name: string | null;
  uri: string | null;
  busy: boolean;
  error: string;
  onChangePhoto: () => void;
};

export function ProfilePhotoField({ name, uri, busy, error, onChangePhoto }: Props) {
  return (
    <View style={styles.root}>
      <Avatar name={name ?? undefined} uri={uri} size="xl" />
      <View style={styles.body}>
        <Text style={styles.label}>Your photo</Text>
        <Text style={styles.hint}>JPG or PNG, up to 2 MB</Text>
        <Button
          variant="secondary"
          size="md"
          loading={busy}
          disabled={busy}
          onPress={onChangePhoto}
          accessibilityLabel={uri ? 'Change photo' : 'Add photo'}>
          {uri ? 'Change photo' : 'Add photo'}
        </Button>
        {error ? <InlineError message={error} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
  },
  body: {
    flex: 1,
    gap: spacing.s1,
    alignItems: 'flex-start',
  },
  label: {
    ...typography.body,
    color: colors.textStrong,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
