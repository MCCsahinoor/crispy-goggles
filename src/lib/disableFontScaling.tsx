import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from "react-native";

export function Text(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

export function TextInput(props: TextInputProps) {
  return <RNTextInput {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}
