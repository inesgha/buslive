import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /** Contenu défilant (formulaires, profil) ou fixe (listes, cartes). */
  scroll?: boolean;
}

/** Conteneur d'écran : fond du thème et marges standard. */
export function Screen({ children, scroll = false }: ScreenProps) {
  const { colors } = useTheme();
  if (scroll) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.fill, { backgroundColor: colors.background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
});
