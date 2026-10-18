import { I18nManager, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts, fontSizes, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

/** Champ de saisie avec libellé et message d'erreur. */
export function TextField({ label, error, style, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppText variant="caption" weight="medium" color="textMuted">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.card,
            borderColor: error ? colors.notCame : colors.border,
            // Contrairement à <Text>, <TextInput> ne s'aligne pas tout seul en RTL.
            textAlign: I18nManager.isRTL ? 'right' : 'left',
          },
          style,
        ]}
      />
      {error ? (
        <AppText variant="caption" color="notCame" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
  },
});
