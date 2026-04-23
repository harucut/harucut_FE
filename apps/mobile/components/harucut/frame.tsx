import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
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

import { ActionButton, Pill, SurfaceCard } from '@/components/harucut/ui';
import {
  FRAME_CATALOG,
  type FrameId,
  type MediaAsset,
  type SavedFrame,
} from '@/constants/harucut-data';
import { HARUCUT_RADII, type HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';

type FrameSlot = {
  height: DimensionValue;
  left: DimensionValue;
  top: DimensionValue;
  width: DimensionValue;
};

type FramePickerLayoutMode = 'carousel' | 'grid';

const FRAME_PICKER_PREVIEW_BOX = {
  height: 176,
  width: 132,
} as const;

const FRAME_LAYOUTS: Record<FrameId, { aspectRatio: number; slots: FrameSlot[] }> = {
  'classic-4': {
    aspectRatio: 0.75,
    slots: [
      { height: '18%', left: '12%', top: '7%', width: '76%' },
      { height: '18%', left: '12%', top: '29%', width: '76%' },
      { height: '18%', left: '12%', top: '51%', width: '76%' },
      { height: '18%', left: '12%', top: '73%', width: '76%' },
    ],
  },
  'grid-4': {
    aspectRatio: 0.9,
    slots: [
      { height: '34%', left: '10%', top: '10%', width: '34%' },
      { height: '34%', left: '56%', top: '10%', width: '34%' },
      { height: '34%', left: '10%', top: '56%', width: '34%' },
      { height: '34%', left: '56%', top: '56%', width: '34%' },
    ],
  },
  'polaroid-4': {
    aspectRatio: 0.82,
    slots: [
      { height: '24%', left: '9%', top: '9%', width: '36%' },
      { height: '24%', left: '55%', top: '9%', width: '36%' },
      { height: '24%', left: '9%', top: '39%', width: '36%' },
      { height: '24%', left: '55%', top: '39%', width: '36%' },
    ],
  },
  'wide-4': {
    aspectRatio: 0.88,
    slots: [
      { height: '16%', left: '8%', top: '12%', width: '84%' },
      { height: '16%', left: '8%', top: '33%', width: '84%' },
      { height: '16%', left: '8%', top: '54%', width: '84%' },
      { height: '16%', left: '8%', top: '75%', width: '84%' },
    ],
  },
};

function useFrameStyles() {
  const { colors, isDark } = useHarucutTheme();

  return useMemo(() => createStyles(colors, isDark), [colors, isDark]);
}

export function FramePreview({
  accentColor,
  backgroundColor,
  caption,
  frameId,
  media = [],
  style,
}: {
  accentColor?: string;
  backgroundColor?: string;
  caption?: string;
  frameId: FrameId;
  media?: MediaAsset[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useHarucutTheme();
  const styles = useFrameStyles();
  const layout = FRAME_LAYOUTS[frameId];
  const resolvedAccent = accentColor ?? colors.primary;
  const resolvedBackground = backgroundColor ?? colors.cardStrong;

  return (
    <View
      style={[
        styles.previewShell,
        { aspectRatio: layout.aspectRatio, backgroundColor: resolvedBackground },
        style,
      ]}>
      <View style={[styles.previewOutline, { borderColor: resolvedAccent }]} />
      {layout.slots.map((slot, index) => {
        const currentMedia = media[index];
        return (
          <View
            key={`${frameId}-${index}`}
            style={[
              styles.slot,
              {
                height: slot.height,
                left: slot.left,
                top: slot.top,
                width: slot.width,
              },
            ]}>
            {currentMedia ? (
              <>
                <Image source={{ uri: currentMedia.uri }} style={styles.slotImage} />
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
      {caption ? <Text style={[styles.caption, { color: resolvedAccent }]}>{caption}</Text> : null}
    </View>
  );
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
  selectedFrameId: FrameId;
}) {
  const styles = useFrameStyles();
  const { width } = useWindowDimensions();
  const { colors } = useHarucutTheme();
  const [layoutMode, setLayoutMode] = useState<FramePickerLayoutMode>('grid');
  const carouselCardWidth = Math.min(Math.max(width - 92, 260), 336);
  const carouselSidePadding = Math.max((width - carouselCardWidth) / 2, 16);
  const carouselCardGap = 12;
  const carouselTrailingPadding = carouselSidePadding + 56;
  const carouselSnapOffsets = FRAME_CATALOG.map(
    (_, index) => index * (carouselCardWidth + carouselCardGap),
  );

  return (
    <>
      <View style={styles.layoutControls}>
        <Text style={styles.layoutLabel}>프레임 보기 방식</Text>
        <View style={styles.layoutOptions}>
          <Pill active={layoutMode === 'grid'} onPress={() => setLayoutMode('grid')}>
            2열 그리드
          </Pill>
          <Pill active={layoutMode === 'carousel'} onPress={() => setLayoutMode('carousel')}>
            가로 카드
          </Pill>
        </View>
      </View>

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
              disableIntervalMomentum
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToOffsets={carouselSnapOffsets}
              contentContainerStyle={[
                styles.carouselContent,
                {
                  paddingLeft: carouselSidePadding,
                  paddingRight: carouselTrailingPadding,
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
      <ActionButton label={confirmLabel} onPress={onConfirm} />
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
  const { colors } = useHarucutTheme();
  const styles = useFrameStyles();
  const previewLayout = getContainedPreviewLayout(frame.frameId);

  return (
    <Pressable
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
          <FramePreview frameId={frame.frameId} style={previewLayout} />
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
  const aspectRatio = FRAME_LAYOUTS[frameId].aspectRatio;
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
  selectedFrameId: FrameId;
  selectedSavedFrameId: string | null;
  title: string;
}) {
  const { colors } = useHarucutTheme();
  const styles = useFrameStyles();
  const matchingFrames = frames.filter((frame) => frame.frameId === selectedFrameId);

  return (
    <SurfaceCard>
      <View style={styles.savedHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.savedTitle}>{title}</Text>
          {description ? <Text style={styles.savedDescription}>{description}</Text> : null}
        </View>
        <Pressable accessibilityLabel="새로고침" onPress={onRefresh} style={styles.savedRefreshButton}>
          <Ionicons color={colors.primary} name="refresh" size={16} />
        </Pressable>
      </View>

      {matchingFrames.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={{ gap: 12, marginTop: 14 }}>
          {matchingFrames.map((frame) => {
            const selected = frame.id === selectedSavedFrameId;
            return (
              <View key={frame.id} style={[styles.savedCard, selected ? styles.savedCardSelected : null]}>
                <Pressable onPress={() => onSelect(frame)} style={styles.savedPressable}>
                  <View style={styles.savedPreview}>
                    <FramePreview
                      accentColor={frame.accentColor}
                      backgroundColor={frame.backgroundColor}
                      caption={frame.caption}
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
      marginTop: 16,
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
      backgroundColor: colors.backgroundTint,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.lg,
      borderWidth: 1,
      justifyContent: 'center',
      overflow: 'hidden',
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
    layoutControls: {
      gap: 10,
      marginBottom: 4,
    },
    layoutLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    layoutOptions: {
      flexDirection: 'row',
      gap: 8,
    },
    previewOutline: {
      borderRadius: 24,
      borderWidth: 2,
      bottom: 8,
      left: 8,
      position: 'absolute',
      right: 8,
      top: 8,
    },
    previewShell: {
      borderRadius: 28,
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
      backgroundColor: colors.cardMuted,
      borderColor: isDark ? 'rgba(147, 197, 253, 0.14)' : 'rgba(37, 99, 235, 0.12)',
      borderRadius: 14,
      borderWidth: 1,
      overflow: 'hidden',
      position: 'absolute',
    },
    slotImage: {
      height: '100%',
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
