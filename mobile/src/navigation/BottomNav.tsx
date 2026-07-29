import { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { usePlayer } from '../contexts/PlayerContext';

// Icon + label per route name — kept here rather than on each Tab.Screen's
// `options` since this bar is the only thing that reads them (no default
// react-navigation tab bar rendering is used at all, see RootNavigator).
const TAB_META: Record<string, { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }> = {
  Dashboard: { icon: 'view-dashboard', label: 'Dashboard' },
  Playlists: { icon: 'playlist-music', label: 'Playlists' },
  Artists: { icon: 'microphone-variant', label: 'Artists' },
  Genres: { icon: 'tag-multiple', label: 'Genres' },
};

const BAR_HEIGHT = 60;
const MIDDLE_BUTTON_SIZE = 68;
const PANEL_MAX_HEIGHT = 160;
// A drag must move at least this far before it's treated as "reveal the
// panel" rather than a tap — lets Pressable children (the tab buttons)
// still receive ordinary taps, since PanResponder only claims the gesture
// once real vertical movement happens.
const DRAG_CLAIM_THRESHOLD = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function MiddleButton() {
  const theme = useTheme();
  const { nowPlaying, isAudioPlaying, togglePlayPause } = usePlayer();

  return (
    <Pressable onPress={togglePlayPause} style={styles.middleButtonSlot} hitSlop={8}>
      <View style={[styles.middleButton, { backgroundColor: theme.colors.primary }]}>
        {nowPlaying ? (
          <MaterialCommunityIcons
            name={isAudioPlaying ? 'pause' : 'play'}
            size={30}
            color={theme.colors.onPrimary}
          />
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          <Image source={require('../../assets/icon.png')} style={styles.middleButtonLogo} />
        )}
      </View>
    </Pressable>
  );
}

// Custom tab bar for the root Tab.Navigator (see RootNavigator.tsx) — fully
// custom rather than the default react-navigation bar because of the two
// requirements the default bar can't do: a bigger, non-route middle
// play/pause button, and a panel above the bar that reveals on an upward
// drag (empty for now — future home for the mini player).
//
// The drag panel is built on core RN Animated + PanResponder rather than
// react-native-reanimated/gesture-handler, since neither was already a
// dependency here and both need native config — this keeps the interaction
// fully JS-driven with zero new native modules.
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const panelHeight = useRef(new Animated.Value(0)).current;
  const panelHeightValue = useRef(0);
  const dragStartValue = useRef(0);

  useEffect(() => {
    const id = panelHeight.addListener(({ value }) => {
      panelHeightValue.current = value;
    });
    return () => panelHeight.removeListener(id);
  }, [panelHeight]);

  const snapTo = useCallback((target: number) => {
    Animated.spring(panelHeight, { toValue: target, useNativeDriver: false, bounciness: 4 }).start();
  }, [panelHeight]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > DRAG_CLAIM_THRESHOLD && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        dragStartValue.current = panelHeightValue.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        panelHeight.setValue(clamp(dragStartValue.current - gesture.dy, 0, PANEL_MAX_HEIGHT));
      },
      onPanResponderRelease: (_evt, gesture) => {
        const expand = panelHeightValue.current > PANEL_MAX_HEIGHT / 2 || gesture.vy < -0.5;
        snapTo(expand ? PANEL_MAX_HEIGHT : 0);
      },
      onPanResponderTerminate: () => {
        snapTo(panelHeightValue.current > PANEL_MAX_HEIGHT / 2 ? PANEL_MAX_HEIGHT : 0);
      },
    })
  ).current;

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const meta = TAB_META[route.name];
    const isFocused = state.index === index;
    const color = isFocused ? theme.colors.primary : theme.colors.onSurfaceVariant;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable key={route.key} onPress={onPress} style={styles.tabButton}>
        <MaterialCommunityIcons name={meta.icon} size={26} color={color} />
        <Text style={[styles.tabLabel, { color }]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.wrapper,
        { backgroundColor: theme.colors.elevation.level2, borderTopColor: theme.colors.outline, paddingBottom: insets.bottom },
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.panel, { height: panelHeight }]} />
      <View style={styles.grabHandle} />
      <View style={[styles.tabRow, { height: BAR_HEIGHT }]}>
        {renderTab(state.routes[0], 0)}
        {renderTab(state.routes[1], 1)}
        <MiddleButton />
        {renderTab(state.routes[2], 2)}
        {renderTab(state.routes[3], 3)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
  },
  panel: {
    overflow: 'hidden',
  },
  grabHandle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginTop: 6,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 11,
  },
  middleButtonSlot: {
    flex: 1,
    alignItems: 'center',
  },
  middleButton: {
    width: MIDDLE_BUTTON_SIZE,
    height: MIDDLE_BUTTON_SIZE,
    borderRadius: MIDDLE_BUTTON_SIZE / 2,
    marginTop: -(MIDDLE_BUTTON_SIZE - BAR_HEIGHT) - 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  middleButtonLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
});
