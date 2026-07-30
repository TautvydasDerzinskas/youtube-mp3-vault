import { useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { TextInput } from 'react-native-paper';

interface PasswordInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  style?: StyleProp<ViewStyle>;
}

// A view/hide toggle on every password field — mobile-specific improvement
// over web's plain masked <input type="password">, since soft-keyboard
// typos are much easier to make (and much harder to spot when masked) on a
// phone than a physical keyboard. Shared by LoginScreen, ChangeEmailScreen,
// and ChangePasswordScreen rather than duplicating the toggle state/icon
// logic at each call site.
export function PasswordInput({ label, value, onChangeText, style }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextInput
      mode="outlined"
      label={label}
      secureTextEntry={!visible}
      value={value}
      onChangeText={onChangeText}
      style={style}
      right={
        <TextInput.Icon
          icon={visible ? 'eye-off' : 'eye'}
          onPress={() => setVisible((v) => !v)}
          forceTextInputFocus={false}
        />
      }
    />
  );
}
