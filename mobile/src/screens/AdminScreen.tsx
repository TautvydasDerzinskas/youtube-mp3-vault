import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const ROWS: { key: 'AdminUsers' | 'AdminTriggers' | 'AdminExport' | 'AdminImport' | 'AdminLogs' | 'AdminSettings'; icon: keyof typeof MaterialCommunityIcons.glyphMap; labelKey: string }[] = [
  { key: 'AdminUsers', icon: 'account-group-outline', labelKey: 'admin.users' },
  { key: 'AdminTriggers', icon: 'flash-outline', labelKey: 'admin.triggers' },
  { key: 'AdminExport', icon: 'file-download-outline', labelKey: 'admin.export' },
  { key: 'AdminImport', icon: 'file-upload-outline', labelKey: 'admin.import' },
  { key: 'AdminLogs', icon: 'text-box-outline', labelKey: 'admin.logs' },
  { key: 'AdminSettings', icon: 'cog-outline', labelKey: 'admin.settings' },
];

// Reached via the shield icon in Profile's header (admin accounts only —
// see RootNavigator's ProfileHeaderRight). Mirrors web's /admin section
// (UsersPage/TriggersPage/ExportPage/ImportPage/LogsPage/SettingsPage), but
// as a simple row-per-section menu pushing to its own screen rather than a
// sidebar + nested routes, since a phone-width sidebar doesn't have
// anywhere useful to live.
export function AdminScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {ROWS.map((row) => (
        <Pressable
          key={row.key}
          onPress={() => navigation.navigate(row.key)}
          style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
        >
          <MaterialCommunityIcons name={row.icon} size={22} color={theme.colors.primary} />
          <Text variant="bodyLarge" style={styles.label}>{t(row.labelKey)}</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, padding: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderRadius: 10,
  },
  label: { flex: 1 },
});
