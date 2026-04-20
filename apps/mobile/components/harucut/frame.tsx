import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';

import {
  FRAME_CATALOG,
  type FrameId,
  type MediaAsset,
  type SavedFrame,
} from '@/constants/harucut-data';
import { HARUCUT_COLORS, HARUCUT_RADII } from '@/constants/harucut-design';
import { ActionButton, Pill, SurfaceCard } from '@/components/harucut/ui';

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

export function FramePreview({
  accentColor = HARUCUT_COLORS.primary,
  backgroundColor = HARUCUT_COLORS.cardStrong,
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
  const layout = FRAME_LAYOUTS[frameId];
  const frameMeta = FRAME_CATALOG.find((item) => item.frameId === frameId);

  return (
    <View style={[styles.previewShell, { aspectRatio: layout.aspectRatio, backgroundColor }]}>
      <View style={[styles.previewOutline, { borderColor: accentColor }]} />
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
              <Text style={styles.slotLabel}>{frameMeta?.shortLabel ?? index + 1}</Text>
            )}
          </View>
        );
      })}
      {caption ? <Text style={[styles.caption, { color: accentColor }]}>{caption}</Text> : null}
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
  const matchingFrames = frames.filter((frame) => frame.frameId === selectedFrameId);

  return (
    <SurfaceCard>
      <View style={styles.savedHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.savedTitle}>{title}</Text>
          {description ? <Text style={styles.savedDescription}>{description}</Text> : null}
        </View>
        <Pressable onPress={onRefresh}>
          <Text style={styles.savedRefresh}>새로고침</Text>
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
                    <Text style={styles.savedStatus}>{selected ? '선택됨' : '클릭해서 선택'}</Text>
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

const styles = StyleSheet.create({
  caption: {
    bottom: '8%',
    fontSize: 10,
    fontWeight: '700',
    left: '10%',
    position: 'absolute',
    textTransform: 'lowercase',
  },
  emptyText: {
    color: HARUCUT_COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
  frameCard: {
    backgroundColor: HARUCUT_COLORS.card,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: HARUCUT_RADII.card,
    borderWidth: 1,
    gap: 10,
    padding: 14,
    width: '48%',
  },
  frameCardSelected: {
    borderColor: HARUCUT_COLORS.primary,
    shadowColor: HARUCUT_COLORS.shadow,
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 32,
  },
  framePreviewWrap: {
    backgroundColor: HARUCUT_COLORS.backgroundTint,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: HARUCUT_RADII.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 12,
  },
  frameSubtitle: {
    color: HARUCUT_COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  frameTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  frameTitle: {
    color: HARUCUT_COLORS.text,
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
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderRadius: 28,
    overflow: 'hidden',
    width: '100%',
  },
  savedCard: {
    backgroundColor: HARUCUT_COLORS.cardStrong,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: HARUCUT_RADII.lg,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  savedCardSelected: {
    borderColor: HARUCUT_COLORS.primary,
  },
  savedCopy: {
    flex: 1,
    gap: 6,
  },
  savedDescription: {
    color: HARUCUT_COLORS.muted,
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
    color: HARUCUT_COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  savedItemTitle: {
    color: HARUCUT_COLORS.text,
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
    color: HARUCUT_COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  savedStatus: {
    color: HARUCUT_COLORS.primaryStrong,
    fontSize: 10,
    fontWeight: '700',
  },
  savedTitle: {
    color: HARUCUT_COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  slot: {
    backgroundColor: 'rgba(227, 238, 252, 0.9)',
    borderColor: 'rgba(37, 99, 235, 0.12)',
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
    color: HARUCUT_COLORS.primaryStrong,
    fontSize: 10,
    fontWeight: '700',
    left: 8,
    position: 'absolute',
    top: 8,
  },
  videoBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 40, 72, 0.66)',
    borderRadius: HARUCUT_RADII.chip,
    bottom: 8,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    width: 22,
  },
});
