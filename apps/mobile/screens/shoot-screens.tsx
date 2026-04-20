import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FRAME_BORDER_OPTIONS, OUTPUT_TONE_OPTIONS, type MediaAsset } from '@/constants/harucut-data';
import { HARUCUT_COLORS } from '@/constants/harucut-design';
import { FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, StepProgress, SurfaceCard } from '@/components/harucut/ui';
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

export function ShootFrameScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const accessMode = useHarucutStore((state) => state.accessMode);
  const savedFrames = useHarucutStore((state) => state.savedFrames);
  const shoot = useHarucutStore((state) => state.shoot);
  const setShootFrame = useHarucutStore((state) => state.setShootFrame);
  const selectSavedFrameForShoot = useHarucutStore((state) => state.selectSavedFrameForShoot);

  return (
    <AppScrollView>
      <PageHeader
        backLabel={accessMode === 'guest' ? '처음으로' : '홈으로'}
        description={
          accessMode === 'guest'
            ? '비회원 체험에서는 촬영과 이미지 다운로드만 할 수 있어요.'
            : '촬영할 프레임을 먼저 골라 주세요.'
        }
        onPressBack={() => push(accessMode === 'guest' ? '/' : '/home')}
        title={accessMode === 'guest' ? '비회원 촬영 체험' : '촬영'}
      />
      <StepProgress current={1} label="프레임 선택" total={4} />
      <FramePickerSection confirmLabel="촬영 시작하기" onConfirm={() => push('/shoot/capture')} onSelect={setShootFrame} selectedFrameId={shoot.frameId} />
      {accessMode === 'member' ? (
        <SavedFramesPanel
          description="같은 타입으로 저장한 프레임을 불러와 바로 이어서 촬영할 수 있어요."
          emptyText="이 타입으로 저장한 프레임이 아직 없어요."
          frames={savedFrames}
          onRefresh={() => undefined}
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
  const replace = (path: string) => router.replace(path as never);
  const cameraRef = useRef<CameraView | null>(null);
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
      replace('/shoot');
    }
  }, [router, shoot.frameId]);

  const remainingShots = Math.max(8 - shoot.shots.length, 0);

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
        title="사진 촬영 · 8장 자동 촬영"
      />

      <SurfaceCard style={{ gap: 14 }}>
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>2단계 · 카메라 촬영 {isShooting ? '· 자동 촬영 중' : ''}</Text>
          <Pill>
            {shoot.shots.length} / 8장 촬영됨
          </Pill>
        </View>

        <View style={styles.cameraFrame}>
          {permission?.granted ? (
            <CameraView
              facing={facing}
              onCameraReady={() => setIsCameraReady(true)}
              ref={cameraRef}
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.bodyText}>카메라 권한을 허용하면 네이티브 카메라로 바로 촬영할 수 있어요.</Text>
              <ActionButton label="카메라 권한 요청" onPress={() => void requestPermission()} />
            </View>
          )}

          <View style={styles.slotBadge}>
            <Text style={styles.slotBadgeText}>슬롯 {(shoot.shots.length % 4) + 1} / 4</Text>
          </View>

          {isShooting && countdown ? (
            <View style={styles.countdownOverlay}>
              <View style={styles.countdownCircle}>
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
              <Text style={styles.overlayCaption}>다음 촬영까지 남은 시간</Text>
              <Text style={styles.overlayCaption}>남은 사진 {remainingShots}장</Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.bodyText}>
            카메라를 켜고 "8장 자동 촬영 시작" 버튼을 누르면 3초 간격으로 사진을 촬영해요.
          </Text>
          <Text style={styles.statusText}>카메라 {isCameraReady ? '준비 완료' : '아직 켜져 있지 않아요'}</Text>
        </View>

        <View style={styles.actionColumn}>
          <ActionButton
            icon={<Ionicons color={HARUCUT_COLORS.text} name="camera-reverse-outline" size={16} />}
            label="카메라 전환"
            onPress={() => setFacing((current) => (current === 'front' ? 'back' : 'front'))}
            variant="secondary"
          />
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="camera-outline" size={16} />}
            label={isShooting ? '촬영 중...' : '8장 자동 촬영 시작'}
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
  const replace = (path: string) => router.replace(path as never);
  const accessMode = useHarucutStore((state) => state.accessMode);
  const shoot = useHarucutStore((state) => state.shoot);
  const toggleShootSelection = useHarucutStore((state) => state.toggleShootSelection);
  const setShootOption = useHarucutStore((state) => state.setShootOption);

  useEffect(() => {
    if (!shoot.frameId) {
      replace('/shoot');
      return;
    }

    if (shoot.shots.length === 0) {
      replace('/shoot/capture');
    }
  }, [router, shoot.frameId, shoot.shots.length]);

  const selectedCount = shoot.selectedShotIds.length;

  return (
    <AppScrollView>
      <PageHeader
        backLabel="다시 촬영"
        description="마음에 드는 사진 4장을 고르고 출력 옵션을 정해 주세요."
        onPressBack={() => push('/shoot/capture')}
        title="사진 선택"
      />

      <SurfaceCard style={{ gap: 14 }}>
        <Text style={styles.bodyText}>방금 촬영한 사진 {shoot.shots.length}장 중에서 4장을 골라 주세요.</Text>
        <View style={styles.mediaGrid}>
          {shoot.shots.map((item) => {
            const selected = shoot.selectedShotIds.includes(item.id);
            return (
              <Pressable key={item.id} onPress={() => toggleShootSelection(item.id)} style={[styles.mediaCard, selected ? styles.mediaCardSelected : null]}>
                <Image source={{ uri: item.uri }} style={styles.mediaImage} />
                <View style={styles.mediaBadge}>
                  <Text style={styles.mediaBadgeText}>{selected ? '선택됨' : item.label}</Text>
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
              key={option}
              active={shoot.tone === option}
              onPress={() => setShootOption('tone', option)}>
              {option}
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
        ) : (
          <Text style={styles.bodyText}>비회원 체험에서는 이미지 결과만 다운로드할 수 있어요.</Text>
        )}
        <ActionButton
          label={`다음 단계로 (${selectedCount}/4)`}
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
  const replace = (path: string) => router.replace(path as never);
  const accessMode = useHarucutStore((state) => state.accessMode);
  const shoot = useHarucutStore((state) => state.shoot);
  const persistShootResult = useHarucutStore((state) => state.persistShootResult);
  const historyItems = useHarucutStore((state) => state.historyItems);
  const renameHistoryItem = useHarucutStore((state) => state.renameHistoryItem);
  const showGuestShareNotice = useHarucutStore((state) => state.showGuestShareNotice);
  const showNotice = useHarucutStore((state) => state.showNotice);
  const [draftName, setDraftName] = useState('');
  const previewRef = useRef<View | null>(null);
  const isGuest = accessMode === 'guest';

  useEffect(() => {
    if (!shoot.frameId) {
      replace('/shoot');
      return;
    }

    if (shoot.selectedShotIds.length !== 4) {
      replace('/shoot/select');
      return;
    }

    if (!isGuest) {
      persistShootResult();
    }
  }, [isGuest, persistShootResult, router, shoot.frameId, shoot.selectedShotIds.length]);

  const currentHistory = historyItems.find((item) => item.id === shoot.persistedHistoryId) ?? null;
  const previewMedia = currentHistory?.previewMedia ?? shoot.shots.filter((item) => shoot.selectedShotIds.includes(item.id));

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
          <FramePreview accentColor={shoot.borderColor} frameId={shoot.frameId} media={previewMedia} />
        </View>
        {!isGuest && shoot.includeVideo ? (
          <FramePreview accentColor={shoot.borderColor} frameId={shoot.frameId} media={previewMedia} />
        ) : null}
      </SurfaceCard>

      {!isGuest && currentHistory ? (
        <SurfaceCard style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>이미지 다운로드</Text>
          <Text style={styles.bodyText}>기록으로 저장될 파일 이름을 수정하고 이미지를 내려받을 수 있어요.</Text>
          <FormField label="파일 이름" onChangeText={setDraftName} value={draftName} />
          <ActionButton
            label="이름 저장"
            onPress={() => renameHistoryItem(currentHistory.id, draftName.trim() || currentHistory.title)}
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
              icon={<Ionicons color={HARUCUT_COLORS.text} name="share-social-outline" size={16} />}
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
            icon={<Ionicons color={HARUCUT_COLORS.text} name="share-social-outline" size={16} />}
            label="링크 공유는 로그인 후 가능해요"
            onPress={showGuestShareNotice}
            variant="ghost"
          />
          <ActionButton
            icon={<Ionicons color={HARUCUT_COLORS.text} name="sparkles-outline" size={16} />}
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

const styles = StyleSheet.create({
  actionColumn: {
    gap: 10,
  },
  bodyText: {
    color: HARUCUT_COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  cameraFrame: {
    aspectRatio: 0.75,
    backgroundColor: '#111827',
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
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: '#FFFFFF',
    borderRadius: 40,
    borderWidth: 1,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 40, 72, 0.42)',
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
    backgroundColor: 'rgba(16, 40, 72, 0.72)',
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
    backgroundColor: HARUCUT_COLORS.primarySoft,
    borderColor: HARUCUT_COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    width: '48%',
  },
  mediaCardSelected: {
    borderColor: HARUCUT_COLORS.primary,
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
    color: HARUCUT_COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  slotBadge: {
    backgroundColor: 'rgba(16, 40, 72, 0.72)',
    borderRadius: 999,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    top: 10,
  },
  slotBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  statusText: {
    color: HARUCUT_COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
});
