import type { Alert as AlertDto, Notification } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { buildAlertInput, draftFromAlert } from '@/alerts/alertForm';
import { fetchAlerts, fetchNotifications, markNotificationsRead, updateAlert } from '@/api/me';
import { queryKeys } from '@/api/network';
import { useAuth } from '@/auth/AuthProvider';
import { AlertRow } from '@/components/AlertRow';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { NotificationRow } from '@/components/NotificationRow';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Screen } from '@/components/Screen';
import { useServiceClock } from '@/hooks/useServiceClock';
import { currentLocale } from '@/i18n';
import { usePush } from '@/notifications/PushProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Onglet Alertes : mes alertes de trajet et l'historique des notifications. */
export default function AlertsScreen() {
  const { t } = useTranslation();
  const { state } = useAuth();

  if (state.status !== 'signedIn') {
    return (
      <Screen>
        <EmptyState
          icon="notifications-outline"
          title={t('alerts.signedOutTitle')}
          message={t('alerts.signedOutMessage')}
          action={{ label: t('alerts.signIn'), onPress: () => router.push('/auth/login') }}
        />
      </Screen>
    );
  }
  return <SignedInAlerts />;
}

function SignedInAlerts() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const locale = currentLocale();
  const clock = useServiceClock();
  const { support, permission } = usePush();

  const alerts = useQuery({ queryKey: queryKeys.alerts, queryFn: fetchAlerts });
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: fetchNotifications,
  });

  const toggle = useMutation({
    mutationFn: ({ alert, enabled }: { alert: AlertDto; enabled: boolean }) => {
      const input = buildAlertInput({ ...draftFromAlert(alert), enabled }, alert.stop.id);
      if (!input) throw new Error('Alerte invalide.');
      return updateAlert(alert.id, input);
    },
    onSuccess: (updated) =>
      queryClient.setQueryData<AlertDto[]>(queryKeys.alerts, (list) =>
        list?.map((alert) => (alert.id === updated.id ? updated : alert)),
      ),
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });

  function openNotification(notification: Notification) {
    if (notification.readAt === null) markRead.mutate([notification.id]);
    if (notification.type === 'BUS_APPROACHING' || notification.type === 'LINE_INCIDENT') {
      router.push({ pathname: '/lines/[id]', params: { id: notification.data.lineId } });
    }
  }

  // Pourquoi les alertes risquent de ne pas arriver en push sur ce téléphone.
  const pushWarning =
    support === 'expoGo'
      ? t('alerts.pushExpoGo')
      : support === 'platform'
        ? t('alerts.pushPlatform')
        : permission === 'denied'
          ? t('alerts.pushDenied')
          : null;

  return (
    <Screen>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={alerts.isRefetching || notifications.isRefetching}
            onRefresh={() => {
              void alerts.refetch();
              void notifications.refetch();
            }}
            tintColor={colors.text}
          />
        }
      >
        {pushWarning ? (
          <Card>
            <AppText variant="caption" color="textMuted">
              {pushWarning}
            </AppText>
          </Card>
        ) : null}

        <AppText variant="heading">{t('alerts.mine')}</AppText>
        {alerts.isPending ? (
          <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
        ) : alerts.error && !alerts.data ? (
          <AppText color="notCame">{t('alerts.loadError')}</AppText>
        ) : alerts.data?.length === 0 ? (
          <AppText color="textMuted">{t('alerts.empty')}</AppText>
        ) : (
          alerts.data?.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              locale={locale}
              onPress={() => router.push({ pathname: '/alerts/edit', params: { id: alert.id } })}
              onToggle={(enabled) => toggle.mutate({ alert, enabled })}
            />
          ))
        )}
        <Button label={t('alerts.new')} onPress={() => router.push('/alerts/edit')} />
        <AppText variant="caption" color="textMuted">
          {t('alerts.liveOnly')}
        </AppText>

        <Card style={styles.section}>
          <AppText variant="heading">{t('alerts.recent')}</AppText>
          {notifications.data?.items.length ? (
            <>
              {notifications.data.items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  locale={locale}
                  clock={clock}
                  onPress={() => openNotification(notification)}
                />
              ))}
              {notifications.data.unread > 0 ? (
                <Button
                  label={t('alerts.markAllRead')}
                  variant="secondary"
                  onPress={() => markRead.mutate(undefined)}
                />
              ) : null}
            </>
          ) : notifications.isPending ? (
            <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />
          ) : (
            <AppText color="textMuted">{t('alerts.noNotifications')}</AppText>
          )}
        </Card>

        <Card style={styles.section}>
          <AppText variant="heading">{t('alerts.alternativesTitle')}</AppText>
          <AppText color="textMuted">{t('alternatives.intro')}</AppText>
          <Button
            label={t('alternatives.find')}
            variant="secondary"
            onPress={() => router.push('/alternatives')}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  section: { gap: spacing.sm },
});
