import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { ReportTabButton } from '@/components/ReportTabButton';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  focused: boolean;
  size: number;
  active: IconName;
  inactive: IconName;
}

/** Icône d'onglet : pleine et foncée quand l'onglet est actif, en contour sinon. */
function TabIcon({ focused, size, active, inactive }: TabIconProps) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={focused ? active : inactive}
      size={size}
      color={focused ? colors.text : colors.textMuted}
    />
  );
}

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused, size }: { focused: boolean; size: number }) => (
    <TabIcon focused={focused} size={size} active={active} inactive={inactive} />
  );
}

/**
 * Barre de navigation : Carte · Lignes · [Signaler] · Alertes · Profil.
 * En arabe (RTL), l'ordre des onglets s'inverse automatiquement.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontFamily: fonts.semiBold, color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('map.title'),
          tabBarLabel: t('tabs.map'),
          tabBarIcon: tabIcon('map', 'map-outline'),
        }}
      />
      <Tabs.Screen
        name="lines"
        options={{
          title: t('lines.title'),
          tabBarLabel: t('tabs.lines'),
          tabBarIcon: tabIcon('bus', 'bus-outline'),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: t('report.title'),
          tabBarLabel: t('tabs.report'),
          tabBarAccessibilityLabel: t('tabs.report'),
          tabBarButton: (props) => (
            <ReportTabButton
              onPress={props.onPress}
              accessibilityLabel={t('tabs.report')}
              accessibilityState={props.accessibilityState}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t('alerts.title'),
          tabBarLabel: t('tabs.alerts'),
          tabBarIcon: tabIcon('notifications', 'notifications-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile.title'),
          tabBarLabel: t('tabs.profile'),
          tabBarIcon: tabIcon('person-circle', 'person-circle-outline'),
        }}
      />
    </Tabs>
  );
}
