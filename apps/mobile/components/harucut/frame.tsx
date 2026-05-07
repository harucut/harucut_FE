import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';

import { ActionButton, SurfaceCard } from '@/components/harucut/ui';
import {
  FRAME_CATALOG,
  type FrameId,
  type MediaAsset,
  type SavedFrame,
  type ThemeEditorComponent,
} from '@/constants/harucut-data';
import { HARUCUT_RADII, type HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';

type ThemeComponentTransform = {
  deltaX?: number;
  deltaY?: number;
  rotationDelta?: number;
  scaleMultiplier?: number;
};

type FrameSlot = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type FrameLayout = {
  slots: FrameSlot[];
  totalHeight: number;
  totalWidth: number;
};

type FramePickerLayoutMode = 'carousel' | 'grid';

const FRAME_PICKER_GRID_MIN_WIDTH = 768;

const FRAME_PICKER_PREVIEW_BOX = {
  height: 176,
  width: 132,
} as const;

const FRAME_PICKER_PREVIEW_COLORS = {
  dark: {
    outer: '#e7ecf2',
    slot: '#171c24',
  },
  light: {
    outer: '#303846',
    slot: '#f4f7fb',
  },
} as const;

// 웹 constants/frameLayouts.ts와 같은 캔버스 규격을 사용합니다.
const FRAME_LAYOUTS: Record<FrameId, FrameLayout> = {
  'classic-4': {
    totalHeight: 6000,
    totalWidth: 2000,
    slots: [
      { height: 1200, width: 1700, x: 150, y: 200 },
      { height: 1200, width: 1700, x: 150, y: 1480 },
      { height: 1200, width: 1700, x: 150, y: 2760 },
      { height: 1200, width: 1700, x: 150, y: 4040 },
    ],
  },
  'grid-4': {
    totalHeight: 6000,
    totalWidth: 4000,
    slots: [
      { height: 2400, width: 1700, x: 200, y: 200 },
      { height: 2400, width: 1700, x: 2100, y: 200 },
      { height: 2400, width: 1700, x: 200, y: 2800 },
      { height: 2400, width: 1700, x: 2100, y: 2800 },
    ],
  },
  'polaroid-4': {
    totalHeight: 6000,
    totalWidth: 4000,
    slots: [
      { height: 2400, width: 1700, x: 200, y: 200 },
      { height: 2400, width: 1700, x: 2100, y: 800 },
      { height: 2400, width: 1700, x: 200, y: 2800 },
      { height: 2400, width: 1700, x: 2100, y: 3400 },
    ],
  },
  'wide-4': {
    totalHeight: 4000,
    totalWidth: 6000,
    slots: [
      { height: 1700, width: 2400, x: 200, y: 200 },
      { height: 1700, width: 2400, x: 2800, y: 200 },
      { height: 1700, width: 2400, x: 200, y: 2100 },
      { height: 1700, width: 2400, x: 2800, y: 2100 },
    ],
  },
};

function toPercent(value: number, total: number): DimensionValue {
  return `${(value / total) * 100}%`;
}

function useFrameStyles() {
  const { colors, isDark } = useHarucutTheme();

  return useMemo(() => createStyles(colors, isDark), [colors, isDark]);
}

export function FramePreview({
  accentColor,
  activeComponentId,
  backgroundColor,
  caption,
  components = [],
  editorMode = false,
  frameId,
  media = [],
  onSelectComponent,
  onTransformComponent,
  slotColor,
  style,
}: {
  accentColor?: string;
  activeComponentId?: string | null;
  backgroundColor?: string;
  caption?: string;
  components?: ThemeEditorComponent[];
  editorMode?: boolean;
  frameId: FrameId;
  media?: MediaAsset[];
  onSelectComponent?: (id: string | null) => void;
  onTransformComponent?: (id: string, transform: ThemeComponentTransform) => void;
  slotColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useHarucutTheme();
  const styles = useFrameStyles();
  const layout = FRAME_LAYOUTS[frameId];
  const [previewSize, setPreviewSize] = useState({ height: 0, width: 0 });
  const pickerPreviewColors = isDark
    ? FRAME_PICKER_PREVIEW_COLORS.dark
    : FRAME_PICKER_PREVIEW_COLORS.light;
  const resolvedAccent = accentColor ?? colors.primary;
  const resolvedBackground = backgroundColor ?? accentColor ?? pickerPreviewColors.outer;
  const resolvedSlotColor = slotColor ?? pickerPreviewColors.slot;

  return (
    <View
      accessible
      accessibilityLabel={caption ? `${caption} 네 컷 프레임 미리보기` : '네 컷 프레임 미리보기'}
      accessibilityRole="image"
      style={[
        styles.previewShell,
        {
          aspectRatio: layout.totalWidth / layout.totalHeight,
          backgroundColor: resolvedBackground,
        },
        style,
      ]}
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setPreviewSize({ height, width });
      }}>
      {layout.slots.map((slot, index) => {
        const currentMedia = media[index];
        const currentPreviewKind = currentMedia?.previewKind ?? currentMedia?.kind;

        return (
          <View
            key={`${frameId}-${index}`}
            style={[
              styles.slot,
              {
                backgroundColor: resolvedSlotColor,
                height: toPercent(slot.height, layout.totalHeight),
                left: toPercent(slot.x, layout.totalWidth),
                top: toPercent(slot.y, layout.totalHeight),
                width: toPercent(slot.width, layout.totalWidth),
              },
            ]}>
            {currentMedia ? (
              <>
                {currentPreviewKind === 'image' ? (
                  <Image
                    accessibilityLabel={currentMedia.label}
                    accessibilityRole="image"
                    resizeMode="cover"
                    source={{ uri: currentMedia.uri }}
                    style={styles.slotImage}
                  />
                ) : (
                  <View style={[styles.slotVideoPlaceholder, { backgroundColor: resolvedSlotColor }]} />
                )}
                {currentMedia.kind === 'video' ? (
                  <View style={styles.videoBadge}>
                    <Ionicons color="#FFFFFF" name="play" size={12} />
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}
      {components
        .filter((component) => !component.hidden)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((component) => (
          <ThemePreviewComponent
            key={component.id}
            active={activeComponentId === component.id}
            component={component}
            editorMode={editorMode}
            layout={layout}
            onSelect={onSelectComponent}
            onTransform={onTransformComponent}
            previewHeight={previewSize.height}
            previewWidth={previewSize.width}
            styles={styles}
          />
        ))}
      {caption && components.length === 0 ? (
        <Text style={[styles.caption, { color: resolvedAccent }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

function isImageSource(source: string) {
  return /^(https?:|file:|content:|data:|blob:)/.test(source);
}

function componentOpacity(component: ThemeEditorComponent) {
  const opacity = component.styleJson?.opacity;
  return typeof opacity === 'number' && Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : 1;
}

function componentFontSize(
  component: ThemeEditorComponent,
  layout: FrameLayout,
  previewWidth: number,
) {
  const baseSize = component.styleJson?.fontSize ?? 128;
  if (previewWidth <= 0) return 12;

  return Math.max(8, (baseSize / layout.totalWidth) * previewWidth);
}

function ThemePreviewComponent({
  active,
  component,
  editorMode,
  layout,
  onSelect,
  onTransform,
  previewHeight,
  previewWidth,
  styles,
}: {
  active: boolean;
  component: ThemeEditorComponent;
  editorMode: boolean;
  layout: FrameLayout;
  onSelect?: (id: string | null) => void;
  onTransform?: (id: string, transform: ThemeComponentTransform) => void;
  previewHeight: number;
  previewWidth: number;
  styles: ReturnType<typeof useFrameStyles>;
}) {
  const opacity = componentOpacity(component);
  const canTransform = editorMode && !component.locked && Boolean(onTransform);
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(1)
        .averageTouches(true)
        .onChange((event) => {
          if (!canTransform || previewWidth <= 0 || previewHeight <= 0) return;

          onTransform?.(component.id, {
            deltaX: (event.changeX / previewWidth) * layout.totalWidth,
            deltaY: (event.changeY / previewHeight) * layout.totalHeight,
          });
        }),
    [canTransform, component.id, layout.totalHeight, layout.totalWidth, onTransform, previewHeight, previewWidth],
  );
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onChange((event) => {
          if (!canTransform) return;

          onTransform?.(component.id, {
            scaleMultiplier: event.scaleChange,
          });
        }),
    [canTransform, component.id, onTransform],
  );
  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .runOnJS(true)
        .onChange((event) => {
          if (!canTransform) return;

          onTransform?.(component.id, {
            rotationDelta: (event.rotationChange * 180) / Math.PI,
          });
        }),
    [canTransform, component.id, onTransform],
  );
  const transformGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture),
    [panGesture, pinchGesture, rotationGesture],
  );
  const commonStyle: StyleProp<ViewStyle> = [
    styles.themeComponent,
    {
      height: toPercent(component.height, layout.totalHeight),
      left: toPercent(component.x, layout.totalWidth),
      opacity,
      top: toPercent(component.y, layout.totalHeight),
      transform: [
        { rotate: `${component.rotation ?? 0}deg` },
        { scale: component.scale ?? 1 },
      ],
      width: toPercent(component.width, layout.totalWidth),
      zIndex: component.zIndex,
    },
    active ? styles.themeComponentActive : null,
  ];

  const content =
    component.type === 'TEXT' || !isImageSource(component.source) ? (
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={[
          styles.themeText,
          {
            color: component.styleJson?.color ?? '#FFFFFF',
            fontSize: componentFontSize(component, layout, previewWidth),
            textAlign: component.styleJson?.textAlign ?? 'center',
          },
        ]}>
        {component.source}
      </Text>
    ) : (
      <Image
        accessibilityLabel={component.type.toLowerCase()}
        resizeMode={component.type === 'STICKER' ? 'contain' : 'cover'}
        source={{ uri: component.source }}
        style={styles.themeImage}
      />
    );

  if (!editorMode || !onSelect) {
    return <View pointerEvents="none" style={commonStyle}>{content}</View>;
  }

  const interactive = (
    <Pressable
      accessibilityLabel={`${component.type} layer`}
      accessibilityRole="button"
      onPress={() => onSelect(component.id)}
      style={commonStyle}>
      {content}
    </Pressable>
  );

  if (!canTransform) {
    return interactive;
  }

  return <GestureDetector gesture={transformGesture}>{interactive}</GestureDetector>;
}

export function FramePickerSection({
  confirmLabel,
  onConfirm,
  onSelect,
  selectedFrameId,
}: {
  confirmLabel: string;
  onConfirm: () => void;
  onSelect: (frameId: FrameId) => void;
  selectedFrameId: FrameId | null;
}) {
  const styles = useFrameStyles();
  const { width } = useWindowDimensions();
  const { colors } = useHarucutTheme();
  const layoutMode: FramePickerLayoutMode =
    width >= FRAME_PICKER_GRID_MIN_WIDTH ? 'grid' : 'carousel';
  const carouselCardWidth = Math.min(Math.max(width - 92, 260), 336);
  const carouselSidePadding = Math.max((width - carouselCardWidth) / 2, 16);
  const carouselCardGap = 12;
  const carouselSnapOffsets = FRAME_CATALOG.map(
    (_, index) => index * (carouselCardWidth + carouselCardGap),
  );

  return (
    <>
      {layoutMode === 'grid' ? (
        <View style={styles.grid}>
          {FRAME_CATALOG.map((frame) => (
            <FramePickerCard
              key={frame.frameId}
              frame={frame}
              layoutMode="grid"
              onPress={() => onSelect(frame.frameId)}
              selected={frame.frameId === selectedFrameId}
            />
          ))}
        </View>
      ) : (
        <View style={styles.carouselSection}>
          <View style={styles.carouselShell}>
            <ScrollView
              bounces={false}
              decelerationRate="fast"
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToOffsets={carouselSnapOffsets}
              contentContainerStyle={[
                styles.carouselContent,
                {
                  paddingLeft: carouselSidePadding,
                  paddingRight: carouselSidePadding,
                },
              ]}>
              {FRAME_CATALOG.map((frame) => (
                <FramePickerCard
                  key={frame.frameId}
                  frame={frame}
                  layoutMode="carousel"
                  onPress={() => onSelect(frame.frameId)}
                  selected={frame.frameId === selectedFrameId}
                  width={carouselCardWidth}
                />
              ))}
            </ScrollView>
            <LinearGradient
              colors={[colors.background, 'transparent']}
              pointerEvents="none"
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.carouselFade, styles.carouselFadeLeft]}
            />
            <LinearGradient
              colors={['transparent', colors.background]}
              pointerEvents="none"
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.carouselFade, styles.carouselFadeRight]}
            />
          </View>
        </View>
      )}
      <ActionButton disabled={!selectedFrameId} label={confirmLabel} onPress={onConfirm} />
    </>
  );
}

function FramePickerCard({
  frame,
  layoutMode,
  onPress,
  selected,
  width,
}: {
  frame: (typeof FRAME_CATALOG)[number];
  layoutMode: FramePickerLayoutMode;
  onPress: () => void;
  selected: boolean;
  width?: number;
}) {
  const { colors, isDark } = useHarucutTheme();
  const styles = useFrameStyles();
  const previewLayout = getContainedPreviewLayout(frame.frameId);
  const previewColors = isDark
    ? FRAME_PICKER_PREVIEW_COLORS.dark
    : FRAME_PICKER_PREVIEW_COLORS.light;

  return (
    <Pressable
      accessibilityLabel={`${frame.name} 프레임${selected ? ', 선택됨' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.frameCard,
        layoutMode === 'grid' ? styles.frameCardGrid : styles.frameCardCarousel,
        selected ? styles.frameCardSelected : null,
        pressed ? styles.frameCardPressed : null,
        width ? { width } : null,
      ]}>
      <View
        style={[
          styles.framePreviewWrap,
          layoutMode === 'grid'
            ? styles.framePreviewWrapGrid
            : styles.framePreviewWrapCarousel,
        ]}>
        <View style={styles.framePreviewViewport}>
          <FramePreview
            backgroundColor={previewColors.outer}
            frameId={frame.frameId}
            slotColor={previewColors.slot}
            style={previewLayout}
          />
        </View>
      </View>

      <View style={styles.frameHeader}>
        <Text style={styles.frameTitle}>{frame.name}</Text>
        <View
          style={[
            styles.selectionBadge,
            selected ? styles.selectionBadgeActive : null,
          ]}>
          <Ionicons
            color={selected ? '#FFFFFF' : colors.muted}
            name={selected ? 'checkmark' : 'ellipse-outline'}
            size={14}
          />
        </View>
      </View>
    </Pressable>
  );
}

function getContainedPreviewLayout(frameId: FrameId) {
  const layout = FRAME_LAYOUTS[frameId];
  const aspectRatio = layout.totalWidth / layout.totalHeight;
  const { width, height } = FRAME_PICKER_PREVIEW_BOX;

  if (aspectRatio * height <= width) {
    return {
      height,
      width: height * aspectRatio,
    } satisfies ViewStyle;
  }

  return {
    height: width / aspectRatio,
    width,
  } satisfies ViewStyle;
}

export function SavedFramesPanel({
  actionLabel = '선택하기',
  description,
  emptyText,
  frames,
  onAction,
  onRefresh,
  onSelect,
  selectedFrameId,
  selectedSavedFrameId,
  title,
}: {
  actionLabel?: string;
  description?: string;
  emptyText: string;
  frames: SavedFrame[];
  onAction?: (frame: SavedFrame) => void;
  onRefresh: () => void;
  onSelect: (frame: SavedFrame) => void;
  selectedFrameId: FrameId | null;
  selectedSavedFrameId: string | null;
  title: string;
}) {
  const { colors } = useHarucutTheme();
  const styles = useFrameStyles();
  const matchingFrames = selectedFrameId
    ? frames.filter((frame) => frame.frameId === selectedFrameId)
    : frames;

  return (
    <SurfaceCard>
      <View style={styles.savedHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.savedTitle}>{title}</Text>
          {description ? <Text style={styles.savedDescription}>{description}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel="저장한 프레임 새로고침"
          accessibilityRole="button"
          onPress={onRefresh}
          style={styles.savedRefreshButton}>
          <Ionicons color={colors.primary} name="refresh" size={16} />
        </Pressable>
      </View>

      {matchingFrames.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={{ gap: 12, marginTop: 8 }}>
          {matchingFrames.map((frame) => {
            const selected = frame.id === selectedSavedFrameId;
            return (
              <View key={frame.id} style={[styles.savedCard, selected ? styles.savedCardSelected : null]}>
                <Pressable
                  accessibilityLabel={`${frame.title} 저장 프레임${selected ? ', 선택됨' : ', 선택하기'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(frame)}
                  style={styles.savedPressable}>
                  <View style={styles.savedPreview}>
                    <FramePreview
                      accentColor={frame.accentColor}
                      backgroundColor={frame.backgroundColor}
                      caption={frame.caption}
                      components={frame.components}
                      frameId={frame.frameId}
                    />
                  </View>
                  <View style={styles.savedCopy}>
                    <Text style={styles.savedItemTitle}>{frame.title}</Text>
                    <Text style={styles.savedItemDescription}>{frame.description}</Text>
                    <Text style={styles.savedStatus}>{selected ? '선택됨' : '터치해서 선택'}</Text>
                  </View>
                </Pressable>
                {onAction ? (
                  <ActionButton
                    label={actionLabel}
                    onPress={() => onAction(frame)}
                    style={{ minHeight: 38, paddingVertical: 10 }}
                    variant="secondary"
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </SurfaceCard>
  );
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  const framePreviewBackground = isDark ? colors.backgroundTint : '#FFFFFF';
  const framePreviewBorder = isDark ? colors.border : 'rgba(148, 163, 184, 0.22)';
  const previewBorder = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(148, 163, 184, 0.34)';

  return StyleSheet.create({
    caption: {
      bottom: '8%',
      fontSize: 10,
      fontWeight: '700',
      left: '10%',
      position: 'absolute',
      textTransform: 'lowercase',
    },
    emptyText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8,
    },
    carouselContent: {
      gap: 12,
      paddingVertical: 4,
    },
    carouselFade: {
      bottom: 0,
      position: 'absolute',
      top: 0,
      width: 28,
    },
    carouselFadeLeft: {
      left: 0,
    },
    carouselFadeRight: {
      right: 0,
    },
    carouselSection: {
      gap: 10,
    },
    carouselShell: {
      marginHorizontal: -16,
      overflow: 'hidden',
    },
    frameCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.card,
      borderWidth: 1,
      gap: 12,
      padding: 14,
    },
    frameCardCarousel: {
      width: 296,
    },
    frameCardGrid: {
      width: '48%',
    },
    frameCardPressed: {
      opacity: 0.92,
    },
    frameCardSelected: {
      borderColor: colors.primary,
      shadowColor: colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: isDark ? 0.34 : 1,
      shadowRadius: 32,
      transform: [{ translateY: -2 }],
    },
    frameHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      minHeight: 26,
    },
    framePreviewWrap: {
      alignItems: 'center',
      backgroundColor: framePreviewBackground,
      borderColor: framePreviewBorder,
      borderRadius: HARUCUT_RADII.lg,
      borderWidth: 1,
      elevation: isDark ? 0 : 1,
      justifyContent: 'center',
      overflow: 'hidden',
      shadowColor: isDark ? colors.shadow : 'rgba(15, 23, 42, 0.10)',
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 18,
    },
    framePreviewWrapCarousel: {
      minHeight: FRAME_PICKER_PREVIEW_BOX.height + 32,
      padding: 16,
    },
    framePreviewWrapGrid: {
      minHeight: FRAME_PICKER_PREVIEW_BOX.height + 24,
      padding: 12,
    },
    framePreviewViewport: {
      alignItems: 'center',
      height: FRAME_PICKER_PREVIEW_BOX.height,
      justifyContent: 'center',
      width: FRAME_PICKER_PREVIEW_BOX.width,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    frameTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      flex: 1,
    },
    previewShell: {
      borderColor: previewBorder,
      borderRadius: 8,
      borderWidth: 1,
      overflow: 'hidden',
      width: '100%',
    },
    savedCard: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.lg,
      borderWidth: 1,
      gap: 12,
      padding: 12,
    },
    savedCardSelected: {
      borderColor: colors.primary,
    },
    savedCopy: {
      flex: 1,
      gap: 6,
    },
    savedDescription: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
    },
    savedHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    savedItemDescription: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
    },
    savedItemTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    savedPressable: {
      flexDirection: 'row',
      gap: 12,
    },
    savedPreview: {
      width: 96,
    },
    savedRefresh: {
      fontSize: 11,
      fontWeight: '700',
    },
    savedRefreshButton: {
      alignItems: 'center',
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.chip,
      borderWidth: 1,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    savedStatus: {
      color: colors.primaryStrong,
      fontSize: 10,
      fontWeight: '700',
    },
    savedTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    selectionBadge: {
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.chip,
      borderWidth: 1,
      height: 22,
      justifyContent: 'center',
      width: 22,
    },
    selectionBadgeActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    slot: {
      borderRadius: 6,
      overflow: 'hidden',
      position: 'absolute',
    },
    slotImage: {
      height: '100%',
      width: '100%',
    },
    slotVideoPlaceholder: {
      backgroundColor: colors.primarySoft,
      height: '100%',
      width: '100%',
    },
    themeComponent: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'absolute',
    },
    themeComponentActive: {
      borderColor: colors.primary,
      borderRadius: 6,
      borderWidth: 1,
    },
    themeImage: {
      height: '100%',
      width: '100%',
    },
    themeText: {
      fontWeight: '700',
      includeFontPadding: false,
      width: '100%',
    },
    videoBadge: {
      alignItems: 'center',
      backgroundColor: colors.overlayStrong,
      borderRadius: HARUCUT_RADII.chip,
      bottom: 8,
      height: 22,
      justifyContent: 'center',
      position: 'absolute',
      right: 8,
      width: 22,
    },
  });
}
