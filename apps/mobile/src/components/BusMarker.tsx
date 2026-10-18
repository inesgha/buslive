import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { badgeTextColor } from './LineBadge';

/** Bus en direct sur la carte : pastille à la couleur de la ligne, bordée de vert « en direct ». */
export function BusMarker({ color }: { color: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.marker, { backgroundColor: color, borderColor: colors.live }]}>
      <Ionicons name="bus" size={18} color={badgeTextColor(color)} />
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
