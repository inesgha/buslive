import type { Locale } from '@buslive/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { updateProfile } from '@/api/me';
import { useAuth } from '@/auth/AuthProvider';
import { session } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { NotificationsCard } from '@/components/NotificationsCard';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TrustCard } from '@/components/TrustCard';
import { changeLocale, currentLocale } from '@/i18n';
import { requestDirection, restartApp } from '@/i18n/direction';
import type { ThemePreference } from '@/storage/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { preference, setPreference, colors } = useTheme();
  const { state, logout } = useAuth();
  const [locale, setLocale] = useState<Locale>(currentLocale());

  async function onLocaleChange(next: Locale) {
    setLocale(next);
    await changeLocale(next);
    // Les notifications push sont rédigées par le serveur, dans la langue du compte.
    if (state.status === 'signedIn') {
      void updateProfile({ locale: next })
        .then((user) => session.updateProfile(user))
        .catch(() => undefined);
    }
    // Passer du français à l'arabe (ou l'inverse) change le sens d'écriture :
    // il ne s'applique qu'après un redémarrage.
    if (requestDirection(next)) {
      Alert.alert(t('profile.restartTitle'), t('profile.restartMessage'), [
        { text: t('profile.restart'), onPress: () => void restartApp() },
      ]);
    }
  }

  return (
    <Screen scroll>
      <Card style={styles.section}>
        <AppText variant="heading">{t('profile.account')}</AppText>
        {state.status === 'restoring' ? (
          <ActivityIndicator color={colors.text} />
        ) : state.status === 'signedIn' ? (
          <>
            <View>
              <AppText variant="caption" color="textMuted">
                {t('profile.signedInAs')}
              </AppText>
              <AppText weight="semiBold">{state.user.displayName}</AppText>
              <AppText color="textMuted">{state.user.email}</AppText>
            </View>
            <Button label={t('profile.signOut')} variant="danger" onPress={() => void logout()} />
          </>
        ) : (
          <>
            <AppText color="textMuted">{t('profile.signedOutHint')}</AppText>
            <Button label={t('profile.signIn')} onPress={() => router.push('/auth/login')} />
            <Button
              label={t('profile.signUp')}
              variant="secondary"
              onPress={() => router.push('/auth/register')}
            />
          </>
        )}
      </Card>

      {state.status === 'signedIn' ? <TrustCard /> : null}
      {state.status === 'signedIn' ? <NotificationsCard user={state.user} /> : null}

      <Card style={styles.section}>
        <AppText variant="heading">{t('profile.language')}</AppText>
        <SegmentedControl<Locale>
          accessibilityLabel={t('profile.language')}
          value={locale}
          onChange={(next) => void onLocaleChange(next)}
          options={[
            { value: 'fr', label: t('languages.fr') },
            { value: 'ar', label: t('languages.ar') },
          ]}
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">{t('profile.theme')}</AppText>
        <SegmentedControl<ThemePreference>
          accessibilityLabel={t('profile.theme')}
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: t('profile.themeSystem') },
            { value: 'light', label: t('profile.themeLight') },
            { value: 'dark', label: t('profile.themeDark') },
          ]}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
});
