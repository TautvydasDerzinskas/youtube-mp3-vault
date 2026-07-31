import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { usePlayer } from '../contexts/PlayerContext';
import { formatDuration } from '../utils/format';
import { MiniPlayer } from './MiniPlayer';

// Icon + i18n label key per route name — kept here rather than on each
// Tab.Screen's `options` since this bar is the only thing that reads them
// (no default react-navigation tab bar rendering is used at all, see
// RootNavigator). Label keys reuse the same frontend/src/i18n nav.* strings
// as the web sidebar.
const TAB_META: Record<string, { icon: keyof typeof MaterialCommunityIcons.glyphMap; labelKey: string }> = {
  Dashboard: { icon: 'view-dashboard', labelKey: 'nav.dashboard' },
  Playlists: { icon: 'playlist-music', labelKey: 'nav.playlists' },
  Artists: { icon: 'microphone-variant', labelKey: 'nav.artists' },
  Genres: { icon: 'tag-multiple', labelKey: 'nav.genres' },
};

// Fixed display order used only in `disabled` mode (see below), where there's
// no real Tab.Navigator state to read route order from.
const DISABLED_ROUTE_ORDER = ['Dashboard', 'Playlists', 'Artists', 'Genres'];

const BAR_HEIGHT = 60;
const MIDDLE_BUTTON_SIZE = 68;
const ROUND_BUTTON_SIZE = 52;
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

type RoundButtonVariant = 'light' | 'dark';

// Prev/next ("light": white circle, red icon) and shuffle/repeat ("dark":
// gray circle, white icon, red when active) — the four controls that pop up
// in place of the outer tab icons once the mini player panel is dragged open
// (see Slot below). Deliberately smaller than MiddleButton so the play/pause
// button stays the visually dominant control even while these are showing.
function RoundButton({
  icon, onPress, disabled, active, variant,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  variant: RoundButtonVariant;
}) {
  const theme = useTheme();
  const backgroundColor = variant === 'light' ? '#ffffff' : theme.colors.elevation.level5;
  const iconColor = variant === 'light'
    ? (disabled ? theme.colors.outlineVariant : theme.colors.primary)
    : (active ? theme.colors.primary : '#ffffff');

  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
      <View style={[styles.roundButton, { backgroundColor }]}>
        <MaterialCommunityIcons name={icon} size={24} color={iconColor} />
      </View>
    </Pressable>
  );
}

// One of the 4 outer tab positions — stacks the normal tab button and its
// pop-up-control replacement in the same spot, cross-fading between them off
// the same panelHeight value that drives the panel reveal, so the fade and
// the "pop up from the bottom" motion always stay in lockstep with the drag.
// `expanded` (not the raw animated value) gates pointerEvents, since that has
// to flip discretely — a mid-fade layer can't be "a little bit tappable".
function Slot({
  tab, control, expanded, tabsOpacity, controlsOpacity, controlsTranslateY,
}: {
  tab: ReactNode;
  control: ReactNode;
  expanded: boolean;
  tabsOpacity: Animated.AnimatedInterpolation<number>;
  controlsOpacity: Animated.AnimatedInterpolation<number>;
  controlsTranslateY: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.slotLayer, { opacity: tabsOpacity }]} pointerEvents={expanded ? 'none' : 'auto'}>
        {tab}
      </Animated.View>
      <Animated.View
        style={[styles.slotLayer, { opacity: controlsOpacity, transform: [{ translateY: controlsTranslateY }] }]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        {control}
      </Animated.View>
    </View>
  );
}

// Custom tab bar for the root Tab.Navigator (see RootNavigator.tsx) — fully
// custom rather than the default react-navigation bar because of what the
// default bar can't do: a bigger, non-route middle play/pause button, an
// always-visible playback progress bar pinned just above the bar, and a
// panel above the bar that reveals on an upward drag — hosting the mini
// player's track info (see MiniPlayer.tsx) plus, in place of the 4 outer tab
// icons, prev/next/shuffle/repeat controls, so the bar becomes a full
// playback control surface while dragged open instead of needing a second
// set of transport buttons inside the panel itself.
//
// The drag panel is built on core RN Animated + PanResponder rather than
// react-native-reanimated/gesture-handler, since neither was already a
// dependency here and both need native config — this keeps the interaction
// fully JS-driven with zero new native modules.
//
// `disabled` mode: rendered without a real Tab.Navigator behind it, when
// AppShell swaps in the offline stack for a server-unreachable session (see
// RootNavigator.tsx) — the 4 route tabs render grayed-out and inert (no
// `state`/`navigation` props are even available in that mode), but the
// middle play/pause button and the drag-reveal MiniPlayer panel keep
// working normally, since both depend only on PlayerContext.
type BottomNavProps = ({ disabled?: false } & BottomTabBarProps) | { disabled: true };

export function BottomNav(props: BottomNavProps) {
  const { disabled } = props;
  const state = disabled ? undefined : props.state;
  const navigation = disabled ? undefined : props.navigation;
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    nowPlaying, currentTime, duration, seekTo,
    hasNext, hasPrevious, playNext, playPrevious,
    isRepeat, isShuffle, toggleRepeat, toggleShuffle,
  } = usePlayer();

  const panelHeight = useRef(new Animated.Value(0)).current;
  const panelHeightValue = useRef(0);
  const dragStartValue = useRef(0);
  // Mirrors panelHeight's resting state (0 or PANEL_MAX_HEIGHT — the spring
  // never settles in between) as a plain boolean, since pointerEvents can't
  // be driven by an Animated value and needs a discrete "is it open" flag —
  // this is also what makes the bottom nav genuinely inert while the panel
  // is open, not just visually faded.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const id = panelHeight.addListener(({ value }) => {
      panelHeightValue.current = value;
    });
    return () => panelHeight.removeListener(id);
  }, [panelHeight]);

  const snapTo = useCallback((target: number) => {
    setExpanded(target === PANEL_MAX_HEIGHT);
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

  // Same panelHeight value that drives the panel's own height, so the tab
  // fade / control pop-up always finishes exactly when the panel does.
  const tabsOpacity = panelHeight.interpolate({ inputRange: [0, PANEL_MAX_HEIGHT], outputRange: [1, 0], extrapolate: 'clamp' });
  const controlsOpacity = panelHeight.interpolate({ inputRange: [0, PANEL_MAX_HEIGHT], outputRange: [0, 1], extrapolate: 'clamp' });
  const controlsTranslateY = panelHeight.interpolate({ inputRange: [0, PANEL_MAX_HEIGHT], outputRange: [20, 0], extrapolate: 'clamp' });

  const routeNames = disabled ? DISABLED_ROUTE_ORDER : state!.routes.map(r => r.name);

  const renderTab = (routeName: string, index: number) => {
    const meta = TAB_META[routeName];
    const isFocused = !disabled && state!.index === index;
    const color = disabled ? theme.colors.outlineVariant : (isFocused ? theme.colors.primary : theme.colors.onSurfaceVariant);

    const onPress = () => {
      if (disabled) return;
      const route = state!.routes[index];
      const event = navigation!.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation!.navigate(route.name);
    };

    return (
      <Pressable key={routeName} onPress={onPress} disabled={disabled} style={styles.tabButton}>
        <MaterialCommunityIcons name={meta.icon} size={26} color={color} />
        <Text style={[styles.tabLabel, { color }]}>{t(meta.labelKey)}</Text>
      </Pressable>
    );
  };

  const slotProps = { expanded, tabsOpacity, controlsOpacity, controlsTranslateY };

  return (
    <View
      style={[
        styles.wrapper,
        { backgroundColor: theme.colors.elevation.level2, borderTopColor: theme.colors.outline, paddingBottom: insets.bottom },
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.panel, { height: panelHeight }]}>
        <MiniPlayer />
      </Animated.View>
      <View style={styles.grabHandle} />

      {/* Always visible whenever a track is loaded (playing or paused), and
          pinned directly above the tab row regardless of panel state — the
          panel grows upward above this, so this row's own position never
          moves. Interactive (seek by dragging) in both collapsed and
          expanded states. */}
      {nowPlaying && (
        <View style={styles.progressSection}>
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: theme.colors.onSurfaceVariant }]}>{formatDuration(currentTime)}</Text>
            <Text style={[styles.timeText, { color: theme.colors.onSurfaceVariant }]}>{formatDuration(duration)}</Text>
          </View>
          <Slider
            style={styles.progressSlider}
            minimumValue={0}
            maximumValue={duration || 1}
            value={currentTime}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.outline}
            thumbTintColor={theme.colors.primary}
            onSlidingComplete={seekTo}
          />
        </View>
      )}

      <View style={[styles.tabRow, { height: BAR_HEIGHT }]}>
        <Slot
          {...slotProps}
          tab={renderTab(routeNames[0], 0)}
          control={<RoundButton icon="repeat" variant="dark" active={isRepeat} onPress={toggleRepeat} />}
        />
        <Slot
          {...slotProps}
          tab={renderTab(routeNames[1], 1)}
          control={<RoundButton icon="skip-previous" variant="light" disabled={!hasPrevious} onPress={playPrevious} />}
        />
        <MiddleButton />
        <Slot
          {...slotProps}
          tab={renderTab(routeNames[2], 2)}
          control={<RoundButton icon="skip-next" variant="light" disabled={!hasNext} onPress={playNext} />}
        />
        <Slot
          {...slotProps}
          tab={renderTab(routeNames[3], 3)}
          control={<RoundButton icon="shuffle" variant="dark" active={isShuffle} onPress={toggleShuffle} />}
        />
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
  progressSection: {
    paddingHorizontal: 14,
    paddingTop: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 11,
  },
  progressSlider: {
    width: '100%',
    height: 20,
  },
  tabRow: {
    flexDirection: 'row',
  },
  slot: {
    flex: 1,
  },
  slotLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  tabButton: {
    alignItems: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
  },
  roundButton: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: ROUND_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
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
