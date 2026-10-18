/**
 * GradientSurface — a rounded blue "hero" surface: a diagonal gradient
 * (SVG LinearGradient behind the content — react-native-svg is already a
 * dependency, so no gradient module) and a faint `pattern` texture (see
 * surfacePatterns.tsx — each page picks its own, so cards don't all look
 * alike). Texture is kept faint so white text on top never loses contrast.
 * Content goes in `children`; the surface only paints — it has no press behaviour (wrap it in a Pressable if needed).
 *
 * Used by the Home "Today's Pulse" card (`pulse`), the Holidays "Next
 * upcoming holiday" card (`festive`) and the Offices "Add office" banner
 * (`map`) — same gradient, a pattern each.
 */
import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { FestivePattern, MapPattern, PulsePattern, type SurfacePattern } from './surfacePatterns';
import { colors, radius } from '../../theme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Which texture to draw over the gradient (default `pulse`). */
  pattern?: SurfacePattern;
};

export function GradientSurface({ children, style, pattern = 'pulse' }: Props) {
  // The SVG needs pixel sizes — measure the surface, draw to fit.
  const [size, setSize] = useState({ width: 0, height: 0 });
  // SVG ids are document-wide: two surfaces on one screen must not share one.
  const gradientId = `surfaceBg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      onLayout={e => setSize(e.nativeEvent.layout)}
      style={[styles.surface, style]}>
      <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.primaryGradientStart} />
            <Stop offset="1" stopColor={colors.primaryGradientEnd} />
          </LinearGradient>
        </Defs>
        <Rect width={size.width} height={size.height} fill={`url(#${gradientId})`} />
        {pattern === 'festive' ? (
          <FestivePattern width={size.width} height={size.height} />
        ) : pattern === 'map' ? (
          <MapPattern width={size.width} height={size.height} />
        ) : (
          <PulsePattern width={size.width} height={size.height} />
        )}
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
});
