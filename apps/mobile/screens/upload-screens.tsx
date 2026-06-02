import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, StepProgress, SurfaceCard } from '@/components/harucut/ui';
import { FRAME_BORDER_OPTIONS, OUTPUT_TONE_OPTIONS, type HistoryItem, type MediaAsset } from '@/constants/harucut-data';
import type { HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiErrorMessage } from '@/lib/api-client';
import { saveRemoteMediaToLibrary, shareMediaLink } from '@/lib/media-download';
import { getMediaDownloadUrl } from '@/lib/user-media-api';
import { useHarucutStore } from '@/store/use-harucut-store';

async function resolveHistoryMediaUrl(item: HistoryItem) {
  if (item.mediaId) {
    try {
      return await getMediaDownloadUrl(item.mediaId);
    } catch {
      // 서명 URL 재발급 실패 시 미리보기 URL로 대체합니다.
    }
  }

  return item.previewMedia[0]?.uri;
}

function useUploadStyles() {
  const { colors } = useHarucutTheme();

  return useMemo(() => createStyles(colors), [colors]);
}

export function UploadFrameScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const accessMode = useHarucutStore((state) => state.accessMode);
  const savedFrames = useHarucutStore((state) => state.savedFrames);
  const loadRemoteFrames = useHarucutStore((state) => state.loadRemoteFrames);
  const upload = useHarucutStore((state) => state.upload);
  const setUploadFrame = useHarucutStore((state) => state.setUploadFrame);
  const selectSavedFrameForUpload = useHarucutStore((state) => state.selectSavedFrameForUpload);

  useEffect(() => {
    if (accessMode === 'member') {
      void loadRemoteFrames();
    }
  }, [accessMode, loadRemoteFrames]);

  return (
    <AppScrollView>
      <PageHeader
        backLabel="홈으로"
        description="업로드로 만들 프레임을 먼저 골라 주세요."
        onPressBack={() => push('/home')}
      />
      <StepProgress current={1} label="프레임 선택" total={3} />
      <FramePickerSection
        confirmLabel="업로드 시작하기"
        onConfirm={() => push('/upload/select')}
        onSelect={setUploadFrame}
        selectedFrameId={upload.frameId}
      />
      <SavedFramesPanel
        description="같은 타입으로 저장한 프레임을 불러와 바로 이어서 만들 수 있어요."
        emptyText="저장된 프레임이 없습니다."
        frames={savedFrames}
        onRefresh={() => void loadRemoteFrames()}
        onSelect={selectSavedFrameForUpload}
        selectedFrameId={upload.frameId}
        selectedSavedFrameId={upload.selectedSavedFrameId}
        title="저장한 프레임"
      />
    </AppScrollView>
  );
}

export function UploadSelectScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const { colors } = useHarucutTheme();
  const styles = useUploadStyles();
  const upload = useHarucutStore((state) => state.upload);
  const addUploadAssets = useHarucutStore((state) => state.addUploadAssets);
  const toggleUploadSelection = useHarucutStore((state) => state.toggleUploadSelection);
  const setUploadOption = useHarucutStore((state) => state.setUploadOption);

  useEffect(() => {
    if (!upload.frameId) {
      router.replace('/upload' as never);
    }
  }, [router, upload.frameId]);

  const selectedCount = upload.selectedAssetIds.length;
  const selectedHasVideo = upload.assets.some(
    (item) => upload.selectedAssetIds.includes(item.id) && item.kind === 'video'
  );
  const previewMedia = useMemo(
    () =>
      upload.selectedAssetIds
        .map((id) => upload.assets.find((item) => item.id === id))
        .filter((item): item is MediaAsset => Boolean(item)),
    [upload.assets, upload.selectedAssetIds],
  );

  const handlePickAssets = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      selectionLimit: 8,
    });

    if (result.canceled) {
      return;
    }

    const nextAssets: MediaAsset[] = result.assets.map((asset, index) => ({
      id: `upload-asset-${Date.now()}-${index}`,
      kind: asset.type === 'video' ? 'video' : 'image',
      label: asset.fileName ?? `업로드 ${index + 1}`,
      uri: asset.uri,
    }));

    addUploadAssets(nextAssets);
  };

  return (
    <AppScrollView>
      <PageHeader
        backLabel="프레임 다시 선택"
        description="사진이나 영상을 넣을 프레임에 어울릴 4개를 골라 주세요."
        onPressBack={() => push('/upload')}
        title="업로드할 사진 선택"
      />

      <SurfaceCard style={{ gap: 14 }}>
        <Text style={styles.sectionTitle}>프레임 미리보기</Text>
        <View style={{ alignItems: 'center' }}>
          <FramePreview accentColor={upload.borderColor} frameId={upload.frameId} media={previewMedia} tone={upload.tone} />
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <Text style={styles.bodyText}>
          {upload.assets.length === 0
            ? '먼저 사진이나 영상을 업로드해 주세요.'
            : `업로드한 미디어 ${upload.assets.length}개 중에서 4개를 골라 주세요.`}
        </Text>
        <ActionButton
          icon={<Ionicons color={colors.text} name="images-outline" size={16} />}
          label="사진 또는 영상 추가하기"
          onPress={() => void handlePickAssets()}
          variant="secondary"
        />

        <View style={styles.mediaGrid}>
          {upload.assets.map((item) => {
            const selected = upload.selectedAssetIds.includes(item.id);
            return (
              <ActionCard
                key={item.id}
                item={item}
                selected={selected}
                onPress={() => toggleUploadSelection(item.id)}
              />
            );
          })}
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <Text style={styles.sectionTitle}>출력 옵션</Text>
        <Text style={styles.bodyText}>프레임 컬러와 결과 톤을 정리하고 다음 단계로 넘어가세요.</Text>
        <View style={styles.filterWrap}>
          {FRAME_BORDER_OPTIONS.map((option) => (
            <Pill
              key={option.value}
              active={upload.borderColor === option.value}
              onPress={() => setUploadOption('borderColor', option.value)}>
              {option.label}
            </Pill>
          ))}
        </View>
        <View style={styles.filterWrap}>
          {OUTPUT_TONE_OPTIONS.map((option) => (
            <Pill
              key={option.id}
              active={upload.tone === option.id}
              onPress={() => setUploadOption('tone', option.id)}>
              {option.label}
            </Pill>
          ))}
        </View>
        <Pill
          active={upload.includeVideo}
          onPress={() => setUploadOption('includeVideo', selectedHasVideo ? !upload.includeVideo : false)}>
          영상 포함
        </Pill>
        <Text style={styles.bodyText}>선택한 미디어에 영상이 포함되어 있을 때만 영상 결과를 함께 보여줍니다.</Text>
        <ActionButton
          label={`다음 단계로 (${selectedCount}/4)`}
          onPress={() => {
            if (selectedCount === 4) {
              push('/upload/result');
            }
          }}
        />
      </SurfaceCard>
    </AppScrollView>
  );
}

export function UploadResultScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const { colors } = useHarucutTheme();
  const styles = useUploadStyles();
  const upload = useHarucutStore((state) => state.upload);
  const persistUploadResult = useHarucutStore((state) => state.persistUploadResult);
  const historyItems = useHarucutStore((state) => state.historyItems);
  const renameHistoryItem = useHarucutStore((state) => state.renameHistoryItem);
  const showNotice = useHarucutStore((state) => state.showNotice);
  const [draftName, setDraftName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'error' | 'idle' | 'saving' | 'saved'>('idle');
  const [downloading, setDownloading] = useState(false);
  const previewRef = useRef<View | null>(null);

  useEffect(() => {
    if (!upload.frameId) {
      router.replace('/upload' as never);
      return;
    }

    if (upload.selectedAssetIds.length !== 4) {
      router.replace('/upload/select' as never);
      return;
    }

    if (upload.persistedHistoryId || saveStatus !== 'idle') {
      return;
    }

    const saveResult = async () => {
      setSaveStatus('saving');

      try {
        if (!previewRef.current) {
          throw new Error('저장할 결과 화면을 찾지 못했어요.');
        }

        const uri = await captureRef(previewRef.current, {
          format: 'jpg',
          quality: 0.96,
        });
        await persistUploadResult(uri);
        setSaveStatus('saved');
      } catch (error) {
        setSaveStatus('error');
        showNotice({
          actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
          eyebrow: 'SAVE ERROR',
          icon: 'warning-outline',
          message: getApiErrorMessage(error, '업로드 결과를 서버에 저장하지 못했어요.'),
          title: '결과 저장 실패',
        });
      }
    };

    void saveResult();
  }, [
    persistUploadResult,
    router,
    saveStatus,
    showNotice,
    upload.frameId,
    upload.persistedHistoryId,
    upload.selectedAssetIds.length,
  ]);

  const currentHistory = historyItems.find((item) => item.id === upload.persistedHistoryId) ?? null;
  const previewMedia =
    currentHistory?.previewMedia ?? upload.assets.filter((item) => upload.selectedAssetIds.includes(item.id));

  useEffect(() => {
    setDraftName(currentHistory?.title ?? '');
  }, [currentHistory?.title]);

  const handleDownload = async () => {
    if (!currentHistory) return;

    setDownloading(true);

    try {
      const url = await resolveHistoryMediaUrl(currentHistory);
      const result = await saveRemoteMediaToLibrary(url, currentHistory.title, currentHistory.kind);

      if (result.ok) {
        showNotice({
          actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
          eyebrow: 'DOWNLOAD',
          icon: 'checkmark-circle-outline',
          message: '사진 보관함에 저장했어요.',
          title: '다운로드 완료',
        });
        return;
      }

      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'DOWNLOAD ERROR',
        icon: 'warning-outline',
        message:
          result.reason === 'permission-denied'
            ? '사진 보관함 권한이 필요해요. 권한을 허용한 뒤 다시 시도해 주세요.'
            : '파일을 내려받지 못했어요. 잠시 후 다시 시도해 주세요.',
        title: '다운로드 실패',
      });
    } catch (error) {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'DOWNLOAD ERROR',
        icon: 'warning-outline',
        message: getApiErrorMessage(error, '파일을 내려받지 못했어요.'),
        title: '다운로드 실패',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!currentHistory) return;

    try {
      const url = await resolveHistoryMediaUrl(currentHistory);
      await shareMediaLink(currentHistory.title, url);
    } catch (error) {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'SHARE ERROR',
        icon: 'warning-outline',
        message: getApiErrorMessage(error, '공유 링크를 준비하지 못했어요.'),
        title: '공유 실패',
      });
    }
  };

  return (
    <AppScrollView>
      <PageHeader title="업로드 결과" />
      <StepProgress current={3} label="결과 확인" total={3} />

      <SurfaceCard style={{ gap: 10 }}>
        <View style={styles.statusRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.sectionTitle}>결과 준비 완료</Text>
            <Text style={styles.bodyText}>마음에 드는 결과를 저장하거나 링크로 공유해 보세요.</Text>
          </View>
          <Pill>{upload.includeVideo ? '이미지 + 영상' : '이미지'}</Pill>
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <View collapsable={false} ref={previewRef}>
          <FramePreview accentColor={upload.borderColor} frameId={upload.frameId} media={previewMedia} tone={upload.tone} />
        </View>
        {upload.includeVideo ? (
          <FramePreview accentColor={upload.borderColor} frameId={upload.frameId} media={previewMedia} tone={upload.tone} />
        ) : null}
      </SurfaceCard>

      {saveStatus === 'saving' ? (
        <SurfaceCard>
          <Text style={styles.bodyText}>결과를 서버에 저장하는 중이에요.</Text>
        </SurfaceCard>
      ) : null}

      {currentHistory ? (
        <SurfaceCard style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>이미지 다운로드</Text>
          <Text style={styles.bodyText}>기록으로 저장될 이미지 이름을 수정할 수 있어요.</Text>
          <FormField label="파일 이름" onChangeText={setDraftName} value={draftName} />
          <ActionButton
            label="이름 저장"
            onPress={() =>
              void renameHistoryItem(currentHistory.id, draftName.trim() || currentHistory.title).catch((error) =>
                showNotice({
                  actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
                  eyebrow: 'SAVE ERROR',
                  icon: 'warning-outline',
                  message: getApiErrorMessage(error, '파일 이름을 저장하지 못했어요.'),
                  title: '이름 변경 실패',
                }),
              )
            }
            variant="secondary"
          />
          <View style={styles.rowButtons}>
            <ActionButton
              icon={<Ionicons color="#FFFFFF" name="download-outline" size={16} />}
              label={downloading ? '다운로드 중...' : '다운로드'}
              onPress={() => void handleDownload()}
              style={{ flex: 1 }}
            />
            <ActionButton
              icon={<Ionicons color={colors.text} name="share-social-outline" size={16} />}
              label="공유하기"
              onPress={() => void handleShare()}
              style={{ flex: 1 }}
              variant="secondary"
            />
          </View>
        </SurfaceCard>
      ) : null}

      <View style={styles.rowButtons}>
        <ActionButton label="사진 다시 고르기" onPress={() => push('/upload/select')} style={{ flex: 1 }} variant="ghost" />
        <ActionButton label="홈으로 가기" onPress={() => push('/home')} style={{ flex: 1 }} variant="secondary" />
      </View>
    </AppScrollView>
  );
}

function ActionCard({
  item,
  onPress,
  selected,
}: {
  item: MediaAsset;
  onPress: () => void;
  selected: boolean;
}) {
  const styles = useUploadStyles();

  return (
    <Pressable
      accessibilityLabel={`${item.label}${selected ? ', 선택됨' : ', 선택하기'}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.mediaCard, selected ? styles.mediaCardSelected : null]}>
      <Image accessibilityLabel={item.label} accessibilityRole="image" source={{ uri: item.uri }} style={styles.mediaImage} />
      <View style={styles.mediaBadge}>
        <Text style={styles.mediaBadgeText}>{selected ? '선택됨' : item.label}</Text>
      </View>
      {item.kind === 'video' ? (
        <View style={styles.videoBadge}>
          <Ionicons color="#FFFFFF" name="play" size={12} />
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(colors: HarucutColors) {
  return StyleSheet.create({
    bodyText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    filterWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    mediaBadge: {
      backgroundColor: colors.overlayStrong,
      borderRadius: 999,
      bottom: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      position: 'absolute',
    },
    mediaBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    mediaCard: {
      aspectRatio: 0.75,
      backgroundColor: colors.primarySoft,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
      position: 'relative',
      width: '48%',
    },
    mediaCardSelected: {
      borderColor: colors.primary,
    },
    mediaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    mediaImage: {
      height: '100%',
      width: '100%',
    },
    rowButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    statusRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    videoBadge: {
      alignItems: 'center',
      backgroundColor: colors.overlayStrong,
      borderRadius: 999,
      bottom: 8,
      height: 22,
      justifyContent: 'center',
      position: 'absolute',
      right: 8,
      width: 22,
    },
  });
}
