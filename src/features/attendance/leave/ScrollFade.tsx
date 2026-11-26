/**
 * ScrollFade — the panes' bottom edge fade (the two-tab Leave redesign,
 * 2026-11; the review's polish list). A thin SVG gradient from transparent
 * to the page surface, absolutely positioned over the scroll area's last
 * few pixels: content that continues past the fold reads as cut off, not
 * finished — the fade is the honest hint that the list keeps going. It
 * never eats touches (pointerEvents="none") and carries no a11y meaning
 * (accessibilityElementsHidden + importantForAccessibility both suppress).
 */
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../theme';

const HEIGHT = 18;

export function ScrollFade() {
  return (
    <Svg
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      width="100%"
      height={HEIGHT}
      style={styles.fade}>
      <Defs>
        <LinearGradient id="scrollFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.surfacePage} stopOpacity="0" />
          <Stop offset="1" stopColor={colors.surfacePage} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={HEIGHT} fill="url(#scrollFade)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
