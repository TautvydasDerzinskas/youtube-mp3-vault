import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useGravatarUrl } from '../hooks/useGravatarUrl';

interface UserAvatarProps {
  email: string | undefined;
  displayName: string | undefined;
  size?: number;
}

// Shared by TopBar (small) and ProfileScreen (large) — mirrors web's
// pattern of an <Avatar src={gravatarUrl}> falling back to an initial
// letter, except React Native's <Image> has no built-in fallback-on-error
// like a browser <img>, so that's tracked explicitly here via onError.
export function UserAvatar({ email, displayName, size = 36 }: UserAvatarProps) {
  const theme = useTheme();
  const avatarUrl = useGravatarUrl(email, 128);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (!avatarUrl || failed) {
    return (
      <View style={[dimensionStyle, { backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: theme.colors.onPrimary, fontSize: size * 0.42, fontWeight: '600' }}>
          {displayName?.[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
    );
  }

  return (
    <Image source={{ uri: avatarUrl }} style={dimensionStyle} onError={() => setFailed(true)} />
  );
}
