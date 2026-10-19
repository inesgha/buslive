import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet } from 'react-native';

import { ApiError } from '@/api/errors';
import { publicUrl } from '@/api/publicUrl';
import { useAuth } from '@/auth/AuthProvider';
import { currentLocale } from '@/i18n';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { TextField } from './TextField';

/**
 * Profil → Confidentialité : politique de confidentialité (page web) et
 * suppression du compte (exigée par Google Play), avec le mot de passe.
 */
export function PrivacyCard() {
  const { t } = useTranslation();
  const { state, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locale = currentLocale();

  function confirmDeletion() {
    Alert.alert(t('privacy.confirmTitle'), t('privacy.confirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('privacy.confirm'), style: 'destructive', onPress: () => void onDelete() },
    ]);
  }

  async function onDelete() {
    setPending(true);
    setError(null);
    try {
      await deleteAccount(password);
      Alert.alert(t('privacy.deletedTitle'), t('privacy.deletedMessage'));
      router.replace('/profile');
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 403
          ? t('privacy.wrongPassword')
          : cause instanceof ApiError && cause.status === 409
            ? t('privacy.staffAccount')
            : t('privacy.error'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('privacy.title')}</AppText>
      <Button
        label={t('privacy.policy')}
        variant="secondary"
        onPress={() => void Linking.openURL(publicUrl(`/legal/privacy?lang=${locale}`))}
      />
      {state.status !== 'signedIn' ? null : deleting ? (
        <>
          <AppText color="textMuted">{t('privacy.deleteExplanation')}</AppText>
          <TextField
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />
          {error ? <AppText color="notCame">{error}</AppText> : null}
          <Button
            label={t('privacy.deleteAccount')}
            variant="danger"
            loading={pending}
            disabled={password.length === 0}
            onPress={confirmDeletion}
          />
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setDeleting(false)}
          />
        </>
      ) : (
        <Button
          label={t('privacy.deleteAccount')}
          variant="danger"
          onPress={() => setDeleting(true)}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
});
