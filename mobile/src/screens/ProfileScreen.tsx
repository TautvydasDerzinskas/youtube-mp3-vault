import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { UserAvatar } from '../components/UserAvatar';

// Reached by tapping the avatar in TopBar (pushed on the parent stack, see
// RootNavigator) — currently just identity + logout. Language/email/
// password/Last.fm settings (see frontend's ProfilePage tabs) come later.
export function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <UserAvatar email={user?.email} displayName={user?.displayName} size={72} />
      <Text variant="titleMedium" style={styles.name}>{user?.displayName}</Text>
      <Text variant="bodyMedium" style={styles.email}>{user?.email}</Text>
      <Button mode="outlined" onPress={() => logout()} style={styles.logoutButton}>
        Log out
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 24, paddingTop: 40, gap: 4 },
  name: { marginTop: 16 },
  email: { opacity: 0.7, marginBottom: 24 },
  logoutButton: { marginTop: 16 },
});
