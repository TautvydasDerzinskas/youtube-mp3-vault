import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { UserAvatar } from '../components/UserAvatar';

// Persistent bar above the tab screens (see RootNavigator's AppShell) —
// logo on the left, profile avatar on the right. navigate('Profile') isn't
// a route on the tab navigator this lives inside, so react-navigation
// bubbles it up to the parent stack navigator that actually has it.
export function TopBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();

  return (
    <View
      style={[
        styles.wrapper,
        { paddingTop: insets.top + 10, backgroundColor: theme.colors.elevation.level2, borderBottomColor: theme.colors.outline },
      ]}
    >
      <Text style={[styles.logo, { color: theme.colors.onBackground }]}>
        Youtube<Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Vault</Text>
      </Text>
      <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
        <UserAvatar email={user?.email} displayName={user?.displayName} size={34} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  logo: {
    fontSize: 18,
    fontWeight: '700',
  },
});
