// Une importation par graisse : seules les 4 graisses utilisées sont embarquées
// dans l'app (importer depuis la racine du paquet les inclurait toutes).
import { ReadexPro_400Regular } from '@expo-google-fonts/readex-pro/400Regular';
import { ReadexPro_500Medium } from '@expo-google-fonts/readex-pro/500Medium';
import { ReadexPro_600SemiBold } from '@expo-google-fonts/readex-pro/600SemiBold';
import { ReadexPro_700Bold } from '@expo-google-fonts/readex-pro/700Bold';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  OFFLINE_MAX_AGE_MS,
  queryClient,
  queryPersister,
  shouldPersistQuery,
} from '@/api/queryClient';
import { AuthProvider } from '@/auth/AuthProvider';
import { initI18n } from '@/i18n';
import { ensureDirection } from '@/i18n/direction';
// Définit la tâche de localisation en arrière-plan dès le démarrage (voir le fichier).
import '@/live/backgroundTask';
import { ShareProvider } from '@/live/ShareProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

// L'écran de démarrage reste affiché tant que la police et la langue ne sont pas prêtes.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ReadexPro_400Regular,
    ReadexPro_500Medium,
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
  });
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const locale = await initI18n();
      // Si le sens d'écriture doit changer, l'app redémarre ici.
      if ((await ensureDirection(locale)) === 'ready') setI18nReady(true);
    })();
  }, []);

  // En cas d'échec du chargement de la police, on continue avec la police système.
  const ready = (fontsLoaded || fontError !== null) && i18nReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Cache des données sauvegardé sur le téléphone : l'app reste utile hors ligne. */}
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            maxAge: OFFLINE_MAX_AGE_MS,
            // À changer si le format des données en cache change (invalide l'ancien cache).
            buster: 'v2',
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
          }}
        >
          <ThemeProvider>
            <AuthProvider>
              <ShareProvider>
                <ThemedNavigation>
                  <RootStack />
                </ThemedNavigation>
              </ShareProvider>
            </AuthProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Applique nos couleurs et notre police aux éléments de navigation (en-têtes, onglets). */
function ThemedNavigation({ children }: { children: ReactNode }) {
  const { colors, scheme } = useTheme();
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.text,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.border,
        notification: colors.notCame,
      },
      fonts: {
        regular: { fontFamily: fonts.regular, fontWeight: '400' as const },
        medium: { fontFamily: fonts.medium, fontWeight: '500' as const },
        bold: { fontFamily: fonts.semiBold, fontWeight: '600' as const },
        heavy: { fontFamily: fonts.bold, fontWeight: '700' as const },
      },
    };
  }, [colors, scheme]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </NavigationThemeProvider>
  );
}

function RootStack() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="auth/login"
        options={{ title: t('auth.loginTitle'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="auth/register"
        options={{ title: t('auth.registerTitle'), presentation: 'modal' }}
      />
      {/* Le titre (numéro et nom de la ligne) est fixé par l'écran lui-même. */}
      <Stack.Screen name="lines/[id]" options={{ title: '' }} />
      <Stack.Screen name="share" options={{ title: t('share.title'), presentation: 'modal' }} />
    </Stack>
  );
}
