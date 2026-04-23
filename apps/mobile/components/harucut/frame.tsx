import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';

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
}: {
  accentColor?: string;
  backgroundColor?: string;
  caption?: string;
  frameId: FrameId;
  media?: MediaAsset[];
}) {
  const { colors } = useHarucutTheme();
  const styles = useFrameStyles();
  const layout = FRAME_LAYOUTS[frameId];
  const frameMeta = FRAME_CATALOG.find((item) => item.frameId === frameId);
  const resolvedAccent = accentColor ?? colors.primary;
  const resolvedBackground = backgroundColor ?? colors.cardStrong;

  return (
    <View style={[styles.previewShell, { aspectRatio: layout.aspectRatio, backgroundColor: resolvedBackground }]}>
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
            ) : (
              <Text style={[styles.slotLabel, { color: resolvedAccent }]}>{frameMeta?.shortLabel ?? index + 1}</Text>
            )}
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

  return (
    <>
      <View style={styles.grid}>
        {FRAME_CATALOG.map((frame) => {
          const selected = frame.frameId === selectedFrameId;
          return (
            <Pressable
              key={frame.frameId}
              onPress={() => onSelect(frame.frameId)}
              style={[styles.frameCard, selected ? styles.frameCardSelected : null]}>
              <Pill active={selected}>{frame.badge}</Pill>
              <Text style={styles.frameTitle}>{frame.name}</Text>
              <Text style={styles.frameSubtitle}>{frame.shortLabel}</Text>
              <View style={styles.framePreviewWrap}>
                <FramePreview frameId={frame.frameId} />
              </View>
              <View style={styles.frameTags}>
                {frame.recommendedFor.slice(0, 2).map((item) => (
                  <Pill key={`${frame.frameId}-${item}`}>{item}</Pill>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      <ActionButton label={confirmLabel} onPress={onConfirm} />
    </>
  );
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
        <Pressable onPress={onRefresh}>
          <Text style={[styles.savedRefresh, { color: colors.primary }]}>새로고침</Text>
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
    frameCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.card,
      borderWidth: 1,
      gap: 10,
      padding: 14,
      width: '48%',
    },
    frameCardSelected: {
      borderColor: colors.primary,
      shadowColor: colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: isDark ? 0.34 : 1,
      shadowRadius: 32,
    },
    framePreviewWrap: {
      backgroundColor: colors.backgroundTint,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.lg,
      borderWidth: 1,
      overflow: 'hidden',
      padding: 12,
    },
    frameSubtitle: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
    },
    frameTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    frameTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
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
    slotLabel: {
      fontSize: 10,
      fontWeight: '700',
      left: 8,
      position: 'absolute',
      top: 8,
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
