import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, StepProgress, SurfaceCard } from '@/components/harucut/ui';
import { FRAME_BORDER_OPTIONS, OUTPUT_TONE_OPTIONS, type MediaAsset } from '@/constants/harucut-data';
import type { HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiErrorMessage } from '@/lib/api-client';
import { useHarucutStore } from '@/store/use-harucut-store';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shareMedia(title: string, uri: string | undefined) {
  if (!uri) return;
  await Share.share({ message: `${title}\n${uri}`, url: uri });
}

async function savePreviewToLibrary(target: View | null) {
  if (!target) {
    return { ok: false as const, reason: 'missing-target' };
  }

  const permission = await MediaLibrary.requestPermissionsAsync();

  if (!permission.granted) {
    return { ok: false as const, reason: 'permission-denied' };
  }

  const uri = await captureRef(target, {
    format: 'jpg',
    quality: 0.96,
  });

  await MediaLibrary.createAssetAsync(uri);
  return { ok: true as const };
}

function useShootStyles() {
  const { colors, isDark } = useHarucutTheme();

  return useMemo(() => createStyles(colors, isDark), [colors, isDark]);
}

export function ShootFrameScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const accessMode = useHarucutStore((state) => state.accessMode);
  const enterAnonymousMode = useHarucutStore((state) => state.enterAnonymousMode);
  const savedFrames = useHarucutStore((state) => state.savedFrames);
  const loadRemoteFrames = useHarucutStore((state) => state.loadRemoteFrames);
  const shoot = useHarucutStore((state) => state.shoot);
  const setShootFrame = useHarucutStore((state) => state.setShootFrame);
  const selectSavedFrameForShoot = useHarucutStore((state) => state.selectSavedFrameForShoot);

  useEffect(() => {
    if (accessMode === 'member') {
      void loadRemoteFrames();
    }
  }, [accessMode, loadRemoteFrames]);

  useEffect(() => {
    setShootFrame(null);
  }, [setShootFrame]);

  return (
    <AppScrollView>
      <PageHeader
        backLabel={accessMode === 'guest' ? '처음으로' : '홈으로'}
        onPressBack={() => {
          if (accessMode === 'guest') {
            enterAnonymousMode();
            push('/');
            return;
          }

          push('/home');
        }}
      />
      <StepProgress current={1} label="프레임 선택" total={4} />
      <FramePickerSection
        confirmLabel={shoot.frameId ? '촬영 시작하기' : '촬영할 프레임을 선택해주세요'}
        onConfirm={() => {
          if (!shoot.frameId) return;

          push('/shoot/capture');
        }}
        onSelect={setShootFrame}
        selectedFrameId={shoot.frameId}
      />
      {accessMode === 'member' ? (
        <SavedFramesPanel
          emptyText="저장된 프레임이 없습니다."
          frames={savedFrames}
          onRefresh={() => void loadRemoteFrames()}
          onSelect={selectSavedFrameForShoot}
          selectedFrameId={shoot.frameId}
          selectedSavedFrameId={shoot.selectedSavedFrameId}
          title="저장한 프레임"
        />
      ) : null}
    </AppScrollView>
  );
}

export function ShootCaptureScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const push = (path: string) => router.push(path as never);
  const cameraRef = useRef<CameraView | null>(null);
  const { colors } = useHarucutTheme();
  const styles = useShootStyles();
  const shoot = useHarucutStore((state) => state.shoot);
  const addShootShot = useHarucutStore((state) => state.addShootShot);
  const resetShootSession = useHarucutStore((state) => state.resetShootSession);
  const showNotice = useHarucutStore((state) => state.showNotice);
  const [facing, setFacing] = useState<CameraType>('front');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isShooting, setIsShooting] = useState(false);

  useEffect(() => {
    if (!shoot.frameId) {
      router.replace('/shoot' as never);
    }
  }, [router, shoot.frameId]);

  const handleStartAutoCapture = async () => {
    if (!permission?.granted) {
      const nextPermission = await requestPermission();

      if (!nextPermission.granted) {
        showNotice({
          actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
          eyebrow: 'CAMERA ACCESS',
          icon: 'camera-outline',
          message: '촬영 체험을 계속하려면 카메라 권한이 필요해요. 설정에서 권한을 허용한 뒤 다시 시도해 주세요.',
          title: '카메라 권한이 필요해요',
        });
      }
      return;
    }

    if (!cameraRef.current || isShooting) {
      return;
    }

    resetShootSession();
    setIsShooting(true);

    try {
      for (let shotIndex = 0; shotIndex < 8; shotIndex += 1) {
        for (let remaining = 3; remaining > 0; remaining -= 1) {
          setCountdown(remaining);
          await delay(700);
        }

        const picture = await cameraRef.current.takePictureAsync({
          quality: 0.6,
          shutterSound: false,
          skipProcessing: true,
        });

        const asset: MediaAsset = {
          id: `shoot-shot-${Date.now()}-${shotIndex}`,
          kind: 'image',
          label: `촬영 ${shotIndex + 1}`,
          uri: picture.uri,
        };

        addShootShot(asset);
      }

      setCountdown(null);
      push('/shoot/select');
    } catch {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'CAPTURE ERROR',
        icon: 'warning-outline',
        message: '촬영을 완료하지 못했어요. 카메라 권한이나 디바이스 상태를 확인한 뒤 다시 시도해 주세요.',
        title: '촬영을 마치지 못했어요',
      });
    } finally {
      setCountdown(null);
      setIsShooting(false);
    }
  };

  return (
    <AppScrollView>
      <PageHeader
        backLabel="프레임 다시 선택"
        onPressBack={() => push('/shoot')}
      />
      <StepProgress current={2} label="사진 촬영" total={4} />

      <SurfaceCard style={{ gap: 14 }}>
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>사진과 영상을 함께 촬영해요</Text>
          <Pill>{shoot.shots.length} / 8장 촬영됨</Pill>
        </View>

        <View style={styles.cameraFrame}>
          {permission === null ? (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.bodyText}>카메라 권한 상태를 확인하는 중이에요.</Text>
            </View>
          ) : permission.granted ? (
            <CameraView
              facing={facing}
              onCameraReady={() => setIsCameraReady(true)}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.bodyText}>카메라 권한을 허용하면 네이티브 카메라로 바로 촬영할 수 있어요.</Text>
              <ActionButton label="카메라 권한 요청" onPress={() => void requestPermission()} />
            </View>
          )}

          {isShooting && countdown ? (
            <View style={styles.countdownOverlay}>
              <View style={styles.countdownCircle}>
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
              <Text style={styles.overlayCaption}>{shoot.shots.length}/8</Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.bodyText}>
            {permission?.granted
              ? '"촬영 시작" 버튼을 누르면 3초 간격으로 사진을 촬영해요.'
              : '카메라 권한을 허용하면 8장 자동 촬영을 시작할 수 있어요.'}
          </Text>
          <Text style={styles.statusText}>카메라 {isCameraReady ? '준비 완료' : '아직 켜져 있지 않아요'}</Text>
        </View>

        <View style={styles.actionColumn}>
          <ActionButton
            icon={<Ionicons color={colors.text} name="camera-reverse-outline" size={16} />}
            label="카메라 전환"
            onPress={() => setFacing((current) => (current === 'front' ? 'back' : 'front'))}
            variant="secondary"
          />
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="camera-outline" size={16} />}
            label={isShooting ? '촬영 중...' : '촬영 시작'}
            onPress={() => void handleStartAutoCapture()}
          />
          {shoot.shots.length >= 4 ? (
            <ActionButton label="촬영 결과 고르기" onPress={() => push('/shoot/select')} variant="ghost" />
          ) : null}
        </View>
      </SurfaceCard>
    </AppScrollView>
  );
}

export function ShootSelectScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const styles = useShootStyles();
  const accessMode = useHarucutStore((state) => state.accessMode);
  const shoot = useHarucutStore((state) => state.shoot);
  const selectedFrameId = shoot.frameId;
  const toggleShootSelection = useHarucutStore((state) => state.toggleShootSelection);
  const setShootOption = useHarucutStore((state) => state.setShootOption);

  useEffect(() => {
    if (!selectedFrameId) {
      router.replace('/shoot' as never);
      return;
    }

    if (shoot.shots.length === 0) {
      router.replace('/shoot/capture' as never);
    }
  }, [router, selectedFrameId, shoot.shots.length]);

  const selectedCount = shoot.selectedShotIds.length;
  const previewMedia = useMemo(
    () =>
      shoot.selectedShotIds
        .map((id) => shoot.shots.find((item) => item.id === id))
        .filter((item): item is MediaAsset => Boolean(item)),
    [shoot.selectedShotIds, shoot.shots],
  );

  if (!selectedFrameId) return null;

  return (
    <AppScrollView>
      <PageHeader
        backLabel="다시 촬영"
        onPressBack={() => push('/shoot/capture')}
      />
      <StepProgress current={3} label="사진 선택" total={4} />

      <SurfaceCard style={{ gap: 14 }}>
        <Text style={styles.sectionTitle}>프레임 미리보기</Text>
        <View style={{ alignItems: 'center' }}>
          <FramePreview accentColor={shoot.borderColor} frameId={selectedFrameId} media={previewMedia} tone={shoot.tone} />
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <Text style={styles.bodyText}>방금 촬영한 사진 {shoot.shots.length}장 중에서 4장을 골라 주세요.</Text>
        <View style={styles.mediaGrid}>
          {shoot.shots.map((item, index) => {
            const selected = shoot.selectedShotIds.includes(item.id);
            return (
              <Pressable
                key={item.id}
                accessibilityLabel={`${item.label}${selected ? ', 선택됨' : ', 선택하기'}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleShootSelection(item.id)}
                style={[styles.mediaCard, selected ? styles.mediaCardSelected : null]}>
                <Image accessibilityLabel={item.label} accessibilityRole="image" source={{ uri: item.uri }} style={styles.mediaImage} />
                <View style={styles.mediaBadge}>
                  <Text style={styles.mediaBadgeText}>#{index + 1}</Text>
                </View>
              </Pressable>
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
              active={shoot.borderColor === option.value}
              onPress={() => setShootOption('borderColor', option.value)}>
              {option.label}
            </Pill>
          ))}
        </View>
        <View style={styles.filterWrap}>
          {OUTPUT_TONE_OPTIONS.map((option) => (
            <Pill
              key={option.id}
              active={shoot.tone === option.id}
              onPress={() => setShootOption('tone', option.id)}>
              {option.label}
            </Pill>
          ))}
        </View>
        {accessMode === 'member' ? (
          <>
            <Pill active={shoot.includeVideo} onPress={() => setShootOption('includeVideo', !shoot.includeVideo)}>
              영상 포함
            </Pill>
            <Text style={styles.bodyText}>촬영 플로우에서는 이미지 중심 결과를 우선 제공합니다.</Text>
          </>
        ) : null}
        <ActionButton
          disabled={selectedCount !== 4}
          label={selectedCount === 4 ? '다음 단계로' : '4장을 골라주세요'}
          onPress={() => {
            if (selectedCount === 4) {
              push('/shoot/result');
            }
          }}
        />
      </SurfaceCard>
    </AppScrollView>
  );
}

export function ShootResultScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const { colors } = useHarucutTheme();
  const styles = useShootStyles();
  const accessMode = useHarucutStore((state) => state.accessMode);
  const shoot = useHarucutStore((state) => state.shoot);
  const selectedFrameId = shoot.frameId;
  const persistShootResult = useHarucutStore((state) => state.persistShootResult);
  const historyItems = useHarucutStore((state) => state.historyItems);
  const renameHistoryItem = useHarucutStore((state) => state.renameHistoryItem);
  const showGuestShareNotice = useHarucutStore((state) => state.showGuestShareNotice);
  const showNotice = useHarucutStore((state) => state.showNotice);
  const [draftName, setDraftName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'error' | 'idle' | 'saving' | 'saved'>('idle');
  const previewRef = useRef<View | null>(null);
  const isGuest = accessMode === 'guest';

  useEffect(() => {
    if (!selectedFrameId) {
      router.replace('/shoot' as never);
      return;
    }

    if (shoot.selectedShotIds.length !== 4) {
      router.replace('/shoot/select' as never);
      return;
    }

    if (isGuest || shoot.persistedHistoryId || saveStatus !== 'idle') {
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
        await persistShootResult(uri);
        setSaveStatus('saved');
      } catch (error) {
        setSaveStatus('error');
        showNotice({
          actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
          eyebrow: 'SAVE ERROR',
          icon: 'warning-outline',
          message: getApiErrorMessage(error, '촬영 결과를 서버에 저장하지 못했어요.'),
          title: '결과 저장 실패',
        });
      }
    };

    void saveResult();
  }, [
    isGuest,
    persistShootResult,
    router,
    saveStatus,
    selectedFrameId,
    shoot.persistedHistoryId,
    shoot.selectedShotIds.length,
    showNotice,
  ]);

  const currentHistory = historyItems.find((item) => item.id === shoot.persistedHistoryId) ?? null;
  const previewMedia =
    currentHistory?.previewMedia ?? shoot.shots.filter((item) => shoot.selectedShotIds.includes(item.id));

  useEffect(() => {
    setDraftName(currentHistory?.title ?? '');
  }, [currentHistory?.title]);

  const handleDownload = async () => {
    const result = await savePreviewToLibrary(previewRef.current);

    if (!result.ok) {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'SAVE ERROR',
        icon: 'download-outline',
        message:
          result.reason === 'permission-denied'
            ? '이미지를 기기에 저장하려면 사진 보관함 권한이 필요해요. 권한을 허용한 뒤 다시 시도해 주세요.'
            : '이미지를 저장할 수 없었어요. 잠시 후 다시 시도해 주세요.',
        title: '이미지 저장을 완료하지 못했어요',
      });
      return;
    }

    if (isGuest) {
      showNotice({
        actions: [
          { id: 'go-login', label: '로그인하고 계속하기' },
          { id: 'dismiss', label: '닫기', variant: 'secondary' },
        ],
        eyebrow: 'NEXT STEP',
        icon: 'checkmark-circle-outline',
        message:
          '체험 결과 이미지를 기기에 저장했어요. 로그인하면 기록 저장, 링크 공유, 업로드 제작 같은 서버 연동 기능까지 바로 이어서 사용할 수 있어요.',
        title: '체험 사진이 저장됐어요',
      });
    }
  };

  if (!selectedFrameId) return null;

  return (
    <AppScrollView>
      <PageHeader title="촬영 결과" />
      <StepProgress current={4} label="결과 확인" total={4} />

      <SurfaceCard style={{ gap: 10 }}>
        <View style={styles.statusRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.sectionTitle}>결과 준비 완료</Text>
            <Text style={styles.bodyText}>
              {isGuest
                ? '체험 결과는 기기에 바로 저장할 수 있어요. 링크 공유와 기록 저장은 로그인 후 사용할 수 있습니다.'
                : '마음에 드는 결과를 저장하거나 링크로 공유해 보세요.'}
            </Text>
          </View>
          <Pill>{isGuest ? '이미지 다운로드' : shoot.includeVideo ? '이미지 + 영상' : '이미지'}</Pill>
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <View collapsable={false} ref={previewRef}>
          <FramePreview accentColor={shoot.borderColor} frameId={selectedFrameId} media={previewMedia} tone={shoot.tone} />
        </View>
        {!isGuest && shoot.includeVideo ? (
          <FramePreview accentColor={shoot.borderColor} frameId={selectedFrameId} media={previewMedia} tone={shoot.tone} />
        ) : null}
      </SurfaceCard>

      {saveStatus === 'saving' ? (
        <SurfaceCard>
          <Text style={styles.bodyText}>결과를 서버에 저장하는 중이에요.</Text>
        </SurfaceCard>
      ) : null}

      {!isGuest && currentHistory ? (
        <SurfaceCard style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>이미지 다운로드</Text>
          <Text style={styles.bodyText}>기록으로 저장될 파일 이름을 수정하고 이미지를 내려받을 수 있어요.</Text>
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
              label="다운로드"
              onPress={() => handleDownload()}
              style={{ flex: 1 }}
            />
            <ActionButton
              icon={<Ionicons color={colors.text} name="share-social-outline" size={16} />}
              label="공유하기"
              onPress={() => shareMedia(currentHistory.title, currentHistory.previewMedia[0]?.uri)}
              style={{ flex: 1 }}
              variant="secondary"
            />
          </View>
        </SurfaceCard>
      ) : null}

      {isGuest ? (
        <SurfaceCard style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>비회원 체험 안내</Text>
          <Text style={styles.bodyText}>
            지금 결과는 기기에 저장할 수 있지만, 링크 공유와 기록 보관, 업로드 제작, 프레임 저장 같은 서버 연동 기능은 로그인 후 사용할 수 있어요.
          </Text>
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="download-outline" size={16} />}
            label="이미지 다운로드"
            onPress={() => void handleDownload()}
          />
          <ActionButton
            icon={<Ionicons color={colors.text} name="share-social-outline" size={16} />}
            label="링크 공유는 로그인 후 가능해요"
            onPress={showGuestShareNotice}
            variant="ghost"
          />
          <ActionButton
            icon={<Ionicons color={colors.text} name="sparkles-outline" size={16} />}
            label="로그인하고 전체 서비스 이용하기"
            onPress={() => push('/login')}
            variant="secondary"
          />
        </SurfaceCard>
      ) : null}

      <View style={styles.rowButtons}>
        <ActionButton
          label={isGuest ? '다시 촬영하기' : '사진 다시 고르기'}
          onPress={() => push('/shoot/select')}
          style={{ flex: 1 }}
          variant="ghost"
        />
        <ActionButton
          label={isGuest ? '로그인으로 이동' : '홈으로 가기'}
          onPress={() => push(isGuest ? '/login' : '/home')}
          style={{ flex: 1 }}
          variant="secondary"
        />
      </View>
    </AppScrollView>
  );
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  return StyleSheet.create({
    actionColumn: {
      gap: 10,
    },
    bodyText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    cameraFrame: {
      aspectRatio: 0.75,
      backgroundColor: colors.backgroundCanvas,
      borderRadius: 24,
      overflow: 'hidden',
      position: 'relative',
    },
    cameraPlaceholder: {
      alignItems: 'center',
      flex: 1,
      gap: 12,
      justifyContent: 'center',
      padding: 24,
    },
    countdownCircle: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.16)',
      borderColor: '#FFFFFF',
      borderRadius: 40,
      borderWidth: 1,
      height: 80,
      justifyContent: 'center',
      width: 80,
    },
    countdownOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      backgroundColor: colors.overlay,
      gap: 8,
      justifyContent: 'center',
    },
    countdownText: {
      color: '#FFFFFF',
      fontSize: 28,
      fontWeight: '700',
    },
    filterWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    mediaBadge: {
      backgroundColor: '#FFFFFF',
      borderColor: 'rgba(17, 24, 39, 0.14)',
      borderRadius: 999,
      borderWidth: 1,
      bottom: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      position: 'absolute',
    },
    mediaBadgeText: {
      color: '#000000',
      fontSize: 10,
      fontWeight: '800',
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
    overlayCaption: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
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
    statusText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '700',
    },
  });
}
