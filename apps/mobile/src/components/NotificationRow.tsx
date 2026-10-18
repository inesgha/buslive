import {
  type Locale,
  type Notification,
  renderNotification,
  type ServiceClock,
} from '@buslive/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatNotificationTime } from '@/time/format';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';

interface NotificationRowProps {
  notification: Notification;
  locale: Locale;
  clock: ServiceClock;
  onPress: () => void;
}

/**
 * Une notification de l'historique. Le texte est rédigé avec les mêmes
 * fonctions que le push (@buslive/shared), dans la langue affichée.
 */
export function NotificationRow({ notification, locale, clock, onPress }: NotificationRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { title, body } = renderNotification(notification, locale);
  const unread = notification.readAt === null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={unread ? t('alerts.unread') : undefined}
      onPress={onPress}
      style={styles.row}
    >
      {/* Point jaune : notification non lue. */}
      <View style={[styles.dot, unread && { backgroundColor: colors.accent }]} />
      <View style={styles.text}>
        <View style={styles.header}>
          <AppText weight={unread ? 'semiBold' : 'medium'} style={styles.title}>
            {title}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {formatNotificationTime(notification.createdAt, clock)}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {body}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 48 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  text: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1 },
});
