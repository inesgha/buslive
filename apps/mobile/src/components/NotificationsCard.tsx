import type { UserProfile } from '@buslive/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet } from 'react-native';

import { sendTestNotification, updateProfile } from '@/api/me';
import { session } from '@/auth/session';
import { usePush } from '@/notifications/PushProvider';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { ToggleRow } from './ToggleRow';

/**
 * Profil → Notifications : état sur ce téléphone, autorisation, essai, et
 * préférence « résultat de mes signalements ».
 */
export function NotificationsCard({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  const { support, permission, registrationFailed, requestPermission } = usePush();
  const [testResult, setTestResult] = useState<string | null>(null);

  const test = useMutation({
    mutationFn: sendTestNotification,
    onSuccess: ({ devices }) => setTestResult(t('notifications.testSent', { count: devices })),
    onError: () => setTestResult(t('notifications.testError')),
  });
  const outcome = useMutation({
    mutationFn: (notifyReportOutcome: boolean) => updateProfile({ notifyReportOutcome }),
    onSuccess: (profile) => session.updateProfile(profile),
  });

  const status =
    support !== 'supported'
      ? t(`notifications.status.${support}`)
      : registrationFailed
        ? t('notifications.status.failed')
        : permission
          ? t(`notifications.status.${permission}`)
          : null;

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('notifications.title')}</AppText>
      {status ? (
        <AppText color={permission === 'granted' && !registrationFailed ? 'live' : 'textMuted'}>
          {status}
        </AppText>
      ) : null}

      {support === 'supported' && permission === 'undetermined' ? (
        <Button label={t('notifications.allow')} onPress={() => void requestPermission()} />
      ) : null}
      {support === 'supported' && permission === 'denied' ? (
        <Button
          label={t('notifications.openSettings')}
          variant="secondary"
          onPress={() => void Linking.openSettings()}
        />
      ) : null}

      <ToggleRow
        label={t('notifications.reportOutcome')}
        hint={t('notifications.reportOutcomeHint')}
        // Valeur affichée tout de suite, avant la réponse de l'API.
        value={
          outcome.isPending
            ? (outcome.variables ?? user.notifyReportOutcome)
            : user.notifyReportOutcome
        }
        onChange={(value) => outcome.mutate(value)}
      />

      <Button
        label={t('notifications.test')}
        variant="secondary"
        loading={test.isPending}
        onPress={() => {
          setTestResult(null);
          test.mutate();
        }}
      />
      {testResult ? (
        <AppText variant="caption" color="textMuted">
          {testResult}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
});
