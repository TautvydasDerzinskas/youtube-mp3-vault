import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface StatCardProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  count: number;
  label: string;
  onPress?: () => void;
}

// One of the 4 square panes in the dashboard's 2x2 grid (see
// DashboardScreen) — `aspectRatio: 1` combined with `flex: 1` on both this
// and its row siblings is what keeps every pane square regardless of
// screen width, so the 2x2 grid always forms a larger square too.
export function StatCard({ icon, count, label, onPress }: StatCardProps) {
  const theme = useTheme();
  const cardStyle = [styles.card, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }];
  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={28} color={theme.colors.primary} />
      <Text style={[styles.count, { color: theme.colors.onBackground }]}>{count}</Text>
      <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>{label}</Text>
    </>
  );

  if (!onPress) {
    return <View style={cardStyle}>{content}</View>;
  }
  return (
    <Pressable onPress={onPress} style={cardStyle}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  count: {
    fontSize: 26,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
  },
});
