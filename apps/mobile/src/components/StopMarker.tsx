import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/** Marqueur d'arrêt sur la carte : pastille jaune avec un bus (plus grande si sélectionnée). */
export function StopMarker({ selected = false }: { selected?: boolean }) {
  const { colors } = useTheme();
  const size = selected ? 40 : 30;
  return (
    <View
      style={[
        styles.marker,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accent,
          borderColor: selected ? colors.onAccent : colors.card,
        },
      ]}
    >
      <Ionicons name="bus" size={selected ? 22 : 16} color={colors.onAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
