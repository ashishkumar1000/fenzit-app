/**
 * TimePickerSheet — the body of TimeField's picker, from the designer's
 * mock: a floating card with the title and a one-line subtitle, three
 * scrolling wheels (hour 01–12, minute 00–59, AM/PM) over a highlighted
 * centre band, a "Standard office shifts" row of one-tap chips, then Done.
 * Replaces the OS clock dial — scrolling to "09 : 00 AM" or tapping a usual
 * time beats dragging a dial hand.
 *
 * Built on a plain Modal, NOT the DS `Sheet`: the native bottom sheet wires
 * its drag gesture to the first scrollable child only, so on Android the
 * minute and am/pm wheels never scrolled (swipes became sheet drags). A
 * Modal has no drag-to-dismiss to fight the wheels; dismissal is the close
 * button, the scrim and Android back.
 *
 * Works on a DRAFT: nothing reaches the form until Done, so closing the
 * sheet (X, scrim, back) leaves the field untouched. The draft re-seeds
 * from `initial` on every open. The wheels show 12-hour time, but the
 * field's value stays 24-hour "HH:mm" (12 AM = 00:xx, 12 PM = 12:xx).
 * Hours and minutes wrap round without touching AM/PM, like the OS wheels.
 * A chip sets the wheels (they scroll to it); it is highlighted while the
 * wheels show exactly that time.
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { TimeWheel, WHEEL_ROW_H, WHEEL_VISIBLE_ROWS } from './TimeWheel';
import { colors, radius, shadow, spacing, typography } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title, e.g. "Select official clock-in schedule". */
  subtitle?: string;
  /** Valid 24-hour "HH:mm" the draft starts from each time the sheet opens. */
  initial: string;
  /** Usual times as one-tap chips (valid 24-hour "HH:mm"). */
  presets?: readonly string[];
  /** Done — the draft becomes the field's value. */
  onDone: (hhmm: string) => void;
};

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'] as const;
const WHEELS_TOP = ((WHEEL_VISIBLE_ROWS - 1) / 2) * WHEEL_ROW_H;

type Draft = { hourIdx: number; minute: number; pm: boolean };

/** 24-hour "HH:mm" → wheel positions (hour wheel index 0 = "01"). */
export function toDraft(hhmm: string): Draft {
  const [h, m] = hhmm.split(':').map(Number);
  return { hourIdx: (h % 12 || 12) - 1, minute: m, pm: h >= 12 };
}

/** Wheel positions → zero-padded 24-hour "HH:mm". */
export function toHHMM({ hourIdx, minute, pm }: Draft): string {
  const h24 = ((hourIdx + 1) % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** "09:00" → "09:00 AM" — how the chips read, matching the wheels. */
function chipLabel(hhmm: string): string {
  const { hourIdx, minute, pm } = toDraft(hhmm);
  return `${HOURS[hourIdx]}:${MINUTES[minute]} ${pm ? 'PM' : 'AM'}`;
}

export function TimePickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  initial,
  presets = [],
  onDone,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const insets = useSafeAreaInsets();
  const chipsRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const chipX = useRef<Record<string, number>>({});

  // Re-seed on open so a discarded draft never leaks into the next open —
  // and bring the matching chip into view (the row scrolls sideways).
  useEffect(() => {
    if (!visible) return;
    setDraft(toDraft(initial));
    const x = chipX.current[initial];
    const timer = setTimeout(
      () => chipsRef.current?.scrollTo({ x: Math.max(0, (x ?? 0) - spacing.s5), animated: false }),
      50,
    );
    return () => clearTimeout(timer);
  }, [visible, initial]);

  const current = toHHMM(draft);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.card, { marginBottom: Math.max(insets.bottom, spacing.s3) }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <IconButton label="Close" size="sm" variant="soft" onPress={onClose}>
              <X size={18} color={colors.textBody} strokeWidth={2} />
            </IconButton>
          </View>

          <View style={styles.wheels}>
            {/* The centre band — the selected row of every wheel sits on it. */}
            <View style={styles.band} pointerEvents="none" />
            <TimeWheel
              label="Hour"
              items={HOURS}
              index={draft.hourIdx}
              onChange={hourIdx => setDraft(d => ({ ...d, hourIdx }))}
              loop
              width={72}
            />
            <View style={styles.colon}>
              <Text style={styles.colonText}>:</Text>
            </View>
            <TimeWheel
              label="Minute"
              items={MINUTES}
              index={draft.minute}
              onChange={minute => setDraft(d => ({ ...d, minute }))}
              loop
              width={88}
            />
            <TimeWheel
              label="AM or PM"
              items={PERIODS}
              index={draft.pm ? 1 : 0}
              onChange={i => setDraft(d => ({ ...d, pm: i === 1 }))}
              width={80}
              accent
            />
          </View>

          {presets.length > 0 ? (
            <View style={styles.presets}>
              <Text style={styles.eyebrow}>STANDARD OFFICE SHIFTS</Text>
              <ScrollView
                ref={chipsRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {presets.map(preset => {
                  const active = preset === current;
                  const label = chipLabel(preset);
                  return (
                    <Pressable
                      key={preset}
                      accessibilityRole="button"
                      accessibilityLabel={`Set ${title} to ${label}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setDraft(toDraft(preset))}
                      onLayout={e => {
                        chipX.current[preset] = e.nativeEvent.layout.x;
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        pressed && styles.pressed,
                      ]}>
                      {active ? (
                        <Check size={14} color={colors.primary} strokeWidth={2.5} />
                      ) : null}
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <Button variant="primary" fullWidth onPress={() => onDone(current)}>
            Done
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  // A floating card: inset from the side and bottom edges, all corners round.
  card: {
    marginHorizontal: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.s5,
    gap: spacing.s4,
    ...shadow.sheet,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  headerText: {
    flex: 1,
    gap: spacing.s1,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  wheels: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEELS_TOP,
    height: WHEEL_ROW_H,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceSunken,
  },
  colon: {
    width: 24,
    height: WHEEL_ROW_H,
    marginTop: WHEELS_TOP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colonText: {
    ...typography.title,
    color: colors.textStrong,
  },
  presets: {
    gap: spacing.s2,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.textMuted,
  },
  chips: {
    gap: spacing.s2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    minHeight: 44,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    ...typography.labelStrong,
    color: colors.textBody,
  },
  chipTextActive: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
