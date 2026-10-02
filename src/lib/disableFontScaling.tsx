import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";

import { isNonLatinLanguage } from "../i18n";

/** Devanagari and Bengali glyphs are taller; give fixed line heights some extra room so they aren't clipped. */
const NON_LATIN_LINE_HEIGHT_SCALE = 1.2;

/**
 * Adjusts text styles for Hindi/Bengali: more line height so matras aren't clipped, and no letter
 * spacing (it breaks conjunct shaping in Indic scripts).
 */
function adaptStyle<T extends TextProps["style"]>(style: T): T {
  if (!isNonLatinLanguage()) {
    return style;
  }
  const flat = StyleSheet.flatten(style);
  if (!flat) {
    return style;
  }
  const override: { lineHeight?: number; letterSpacing?: number } = {};
  if (typeof flat.lineHeight === "number") {
    override.lineHeight = Math.round(flat.lineHeight * NON_LATIN_LINE_HEIGHT_SCALE);
  }
  if (flat.letterSpacing) {
    override.letterSpacing = 0;
  }
  if (Object.keys(override).length === 0) {
    return style;
  }
  return [style, override] as unknown as T;
}

export function Text({ style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      style={adaptStyle(style)}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
    />
  );
}

export function TextInput(props: TextInputProps) {
  return <RNTextInput {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}
