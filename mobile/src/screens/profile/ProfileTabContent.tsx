import { StyleSheet, View } from 'react-native';
import { Text, Divider, Button, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';

// Mirrors web's ProfileTab.tsx, minus the disabled displayName TextField —
// a read-only labeled row reads better than a greyed-out input on mobile.
// Email/password aren't edited inline here either: "Change email"/"Change
// password" each push a dedicated screen, same as web's separate
// /profile/email and /profile/password routes.
export function ProfileTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();

  return (
    <View>
      <View style={styles.header}>
        <UserAvatar email={user?.email} displayName={user?.displayName} size={64} />
        <View style={styles.headerText}>
          <Text variant="titleMedium">{user?.displayName}</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{user?.email}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{t('profile.displayName')}</Text>
        <Text variant="bodyLarge">{user?.displayName}</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{t('profile.displayNameHelper')}</Text>
      </View>

      <Divider style={styles.divider} />

      <View style={styles.actionRow}>
        <View style={styles.actionText}>
          <Text variant="bodyLarge">{user?.email}</Text>
          {user?.pendingEmail && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('profile.pendingEmailShort', { email: user.pendingEmail })}
            </Text>
          )}
        </View>
        <Button mode="text" onPress={() => navigation.navigate('ChangeEmail')}>
          {t('profile.changeEmailLink')}
        </Button>
      </View>

      <View style={styles.actionRow}>
        <Text variant="bodyLarge">••••••••</Text>
        <Button mode="text" onPress={() => navigation.navigate('ChangePassword')}>
          {t('profile.changePasswordLink')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  headerText: { flexShrink: 1 },
  row: { marginBottom: 16, gap: 2 },
  divider: { marginBottom: 8 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  actionText: { flexShrink: 1 },
});
