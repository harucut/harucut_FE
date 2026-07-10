import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FRAME_LAYOUTS, FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, StepProgress, SurfaceCard } from '@/components/harucut/ui';
import { FRAME_BORDER_OPTIONS, OUTPUT_TONE_OPTIONS, type MediaAsset } from '@/constants/harucut-data';
import type { HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiErrorMessage } from '@/lib/api-client';
import { useLibraryStore } from '@/store/use-library-store';
import { useSessionStore } from '@/store/use-session-store';
import { useShootStore } from '@/store/use-shoot-store';

// 촬영 총 장수
const SHOOT_TOTAL = 8;
// 선택 가능한 타이머 간격(초)
const TIMER_OPTIONS = [3, 5, 8] as const;
type TimerSeconds = (typeof TIMER_OPTIONS)[number];
// 촬영 모드: 타이머(간격 선택 → 8장 자동 연속) / 수동(셔터 1장씩)
type CaptureMode = 'manual' | 'timer';

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
  const accessMode = useSessionStore((state) => state.accessMode);
  const enterAnonymousMode = useSessionStore((state) => state.enterAnonymousMode);
  const savedFrames = useLibraryStore((state) => state.savedFrames);
  const loadRemoteFrames = useLibraryStore((state) => state.loadRemoteFrames);
  const shoot = useShootStore();
  const setShootFrame = useShootStore((state) => state.setShootFrame);
  const selectSavedFrameForShoot = useShootStore((state) => state.selectSavedFrameForShoot);

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
  // 타이머 촬영 루프는 수 초간 await가 이어지므로, 그 사이 사용자가 화면을 벗어나면
  // 언마운트된 컴포넌트에 setState/네비게이션이 발생할 수 있다. 마운트 여부를 추적해
  // 루프 중간에 안전하게 빠져나가기 위한 ref.
  const isMountedRef = useRef(true);
  // 타이머 카운트다운을 셔터 탭으로 즉시 끝내기 위한 신호.
  // captureNowRef: "지금 이 컷을 바로 찍어라" 플래그. tickResolveRef: 진행 중인 1초 틱을 깨우는 resolver.
  const captureNowRef = useRef(false);
  const tickResolveRef = useRef<(() => void) | null>(null);
  const { colors } = useHarucutTheme();
  const styles = useShootStyles();
  const shoot = useShootStore();
  const addShootShot = useShootStore((state) => state.addShootShot);
  const resetShootSession = useShootStore((state) => state.resetShootSession);
  const showNotice = useSessionStore((state) => state.showNotice);
  const [facing, setFacing] = useState<CameraType>('front');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isShooting, setIsShooting] = useState(false);
  // 촬영 모드/타이머 간격은 시작 전에만 변경 가능(시작 후 잠금)
  // 기본은 수동 촬영. 타이머 모드는 사용자가 직접 선택할 수 있다.
  const [captureMode, setCaptureMode] = useState<CaptureMode>('manual');
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(3);
  const layout = shoot.frameId ? FRAME_LAYOUTS[shoot.frameId] : null;
  const slotCount = layout ? layout.slots.length : 4;
  // 8장을 슬롯 수로 순환 — 지금 찍는 칸 인덱스.
  const cameraSlotIndex = shoot.shots.length % slotCount;
  // 촬영 중에는 프레임을 씌우지 않고, 선택한 프레임의 슬롯 비율만 카메라 프리뷰에 반영한다.
  // 프레임(테두리·데코)은 사진을 배치하는 다음 단계부터 보인다.
  const currentSlot = layout ? layout.slots[cameraSlotIndex] : null;
  const isTallSlot = currentSlot ? currentSlot.width / currentSlot.height < 1 : true;
  // 세션이 시작되면(촬영 중이거나 이미 한 장 이상 찍었으면) 모드/간격을 잠근다.
  // 수동 모드는 매 컷 후 isShooting이 false가 되므로 isShooting만으로는 부족하다.
  const sessionLocked = isShooting || shoot.shots.length > 0;

  useEffect(() => {
    if (!shoot.frameId) {
      router.replace('/shoot' as never);
    }
  }, [router, shoot.frameId]);

  // 캡처 화면에 진입할 때마다 이전(완료·중단)된 세션의 촬영본을 비운다.
  // resetShootSession은 frameId/선택 프레임은 유지하고 shots만 초기화하므로,
  // 재촬영 진입 시 모드·간격을 다시 고를 수 있고 수동 촬영이 9장째로 누적되지 않는다.
  useEffect(() => {
    resetShootSession();
  }, [resetShootSession]);

  // 언마운트 시 진행 중인 타이머 버스트 루프가 더 이상 상태를 갱신하거나
  // 화면을 전환하지 않도록 마운트 플래그를 내린다.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // 진행 중인 카운트다운 틱이 있으면 깨워, await가 영원히 매달리지 않게 한다.
      tickResolveRef.current?.();
    };
  }, []);

  // 촬영본이 있는데 안드로이드 하드웨어 백을 누르면, 확인 없이 사진이 사라지지 않도록
  // 확인 다이얼로그를 띄운다(화면이 포커스일 때만 백 이벤트를 가로챈다).
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (shoot.shots.length === 0) return false;
        showNotice({
          actions: [
            { id: 'dismiss', label: '계속 촬영', variant: 'secondary' },
            {
              id: 'dismiss',
              label: '나가기',
              variant: 'danger',
              onPress: () => {
                resetShootSession();
                router.replace('/shoot' as never);
              },
            },
          ],
          eyebrow: 'LEAVE CAPTURE',
          icon: 'warning-outline',
          message: '지금 나가면 찍은 사진이 모두 사라져요. 정말 나갈까요?',
          title: '촬영을 그만둘까요?',
        });
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => subscription.remove();
    }, [shoot.shots.length, showNotice, resetShootSession, router]),
  );

  // 카메라 권한이 없으면 요청하고, 끝내 거부되면 안내 후 false를 돌려준다.
  const ensureCameraPermission = async () => {
    if (permission?.granted) return true;

    const nextPermission = await requestPermission();

    if (!nextPermission.granted) {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'CAMERA ACCESS',
        icon: 'camera-outline',
        message: '촬영 체험을 계속하려면 카메라 권한이 필요해요. 설정에서 권한을 허용한 뒤 다시 시도해 주세요.',
        title: '카메라 권한이 필요해요',
      });
      return false;
    }

    return true;
  };

  // 한 장 촬영해서 세션에 추가하고, 추가 후 누적 장수를 돌려준다.
  const captureOneShot = async (shotIndex: number) => {
    if (!cameraRef.current) return shotIndex;

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
    return shotIndex + 1;
  };

  // 타이머 카운트다운의 1초 틱. 셔터 탭(handleShootNow)이 들어오면 남은 대기를 깨고 즉시 반환한다.
  const waitTickOrSkip = () =>
    new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        tickResolveRef.current = null;
        resolve();
      };
      const timeoutId = setTimeout(finish, 1000);
      tickResolveRef.current = finish;
    });

  // 타이머 모드: 선택한 간격으로 8장을 자동 연속 촬영.
  // 카운트다운 중 셔터를 탭하면 남은 대기를 스킵하고 그 컷을 즉시 찍는다(captureNowRef + tickResolveRef로 틱 인터럽트).
  const handleTimerBurst = async () => {
    if (!(await ensureCameraPermission())) return;
    if (!cameraRef.current || isShooting) return;

    resetShootSession();
    captureNowRef.current = false;
    setIsShooting(true);

    try {
      for (let shotIndex = 0; shotIndex < SHOOT_TOTAL; shotIndex += 1) {
        // 컷마다 스킵 플래그를 초기화해, 직전 컷의 탭이 다음 컷으로 새지 않게 한다.
        captureNowRef.current = false;

        for (let remaining = timerSeconds; remaining > 0; remaining -= 1) {
          // 카운트다운 도중 화면을 벗어났으면 즉시 중단(언마운트 후 setState 방지).
          if (!isMountedRef.current) return;
          // 셔터를 탭했으면 남은 카운트다운을 건너뛴다.
          if (captureNowRef.current) break;
          setCountdown(remaining);
          // 1초 틱으로 맞춰 선택한 간격(3·5·8초)이 실제 촬영 간격과 일치하게 한다(탭하면 조기 종료).
          await waitTickOrSkip();
          if (captureNowRef.current) break;
        }

        // 촬영 직전 이탈했으면 더 찍지 않는다.
        if (!isMountedRef.current) return;
        captureNowRef.current = false;
        await captureOneShot(shotIndex);
      }

      // 완료 직전 이탈했으면 화면 전환하지 않는다.
      if (!isMountedRef.current) return;
      setCountdown(null);
      push('/shoot/select');
    } catch {
      if (!isMountedRef.current) return;
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'CAPTURE ERROR',
        icon: 'warning-outline',
        message: '촬영을 완료하지 못했어요. 카메라 권한이나 디바이스 상태를 확인한 뒤 다시 시도해 주세요.',
        title: '촬영을 마치지 못했어요',
      });
    } finally {
      // 언마운트 이후에는 상태를 건드리지 않는다.
      if (isMountedRef.current) {
        setCountdown(null);
        setIsShooting(false);
      }
    }
  };

  // 타이머 카운트다운 중 셔터 탭: 남은 대기를 스킵하고 즉시 그 컷을 찍는다.
  // 대기 틱이 없는 순간(이미 캡처 진행 중)의 탭은 무시해 중복 촬영을 막는다.
  const handleShootNow = () => {
    if (!isShooting || !tickResolveRef.current) return;
    captureNowRef.current = true;
    tickResolveRef.current();
  };

  // 수동 모드: 셔터를 누를 때마다 즉시 1장. 8장째에서 자동으로 고르기 단계로 이동.
  const handleManualShutter = async () => {
    if (!(await ensureCameraPermission())) return;
    if (!cameraRef.current || isShooting) return;

    // 첫 컷이면 세션을 초기화한다.
    const isFirst = shoot.shots.length === 0;
    setIsShooting(true);

    try {
      if (isFirst) {
        resetShootSession();
      }

      const total = await captureOneShot(isFirst ? 0 : shoot.shots.length);

      // 촬영 도중 화면을 벗어났으면 네비게이션하지 않는다.
      if (total >= SHOOT_TOTAL && isMountedRef.current) {
        push('/shoot/select');
      }
    } catch {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'CAPTURE ERROR',
        icon: 'warning-outline',
        message: '촬영을 완료하지 못했어요. 카메라 권한이나 디바이스 상태를 확인한 뒤 다시 시도해 주세요.',
        title: '촬영을 마치지 못했어요',
      });
    } finally {
      if (isMountedRef.current) setIsShooting(false);
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
          <Text style={styles.statusText}>선택한 프레임 비율로 8장을 촬영해요</Text>
          <Pill>{shoot.shots.length} / {SHOOT_TOTAL}장 촬영됨</Pill>
        </View>

        <View style={styles.stageWrap}>
          {layout && currentSlot ? (
            <View
              style={[
                styles.cameraStage,
                isTallSlot ? styles.stageTall : styles.stageWide,
                { aspectRatio: currentSlot.width / currentSlot.height },
              ]}>
              {permission?.granted ? (
                <CameraView
                  // 신 아키텍처(Fabric)에서는 facing prop만 바꿔도 실제 카메라가
                  // 전환되지 않는 경우가 있어, key로 강제 remount해 후면/전면 전환을 보장한다.
                  key={facing}
                  facing={facing}
                  onCameraReady={() => setIsCameraReady(true)}
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <View style={styles.cameraSlotPlaceholder}>
                  <Ionicons color="#FFFFFF" name="camera-outline" size={22} />
                </View>
              )}
            </View>
          ) : null}

          {isShooting && countdown ? (
            <View pointerEvents="none" style={styles.countdownOverlay}>
              <View style={styles.countdownCircle}>
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
              <Text style={styles.overlayCaption}>{shoot.shots.length}/{SHOOT_TOTAL}</Text>
              <Text style={styles.overlayHint}>셔터를 누르면 바로 이 컷을 찍어요</Text>
            </View>
          ) : null}
        </View>

        {/* 찍은 컷 미리보기 — 프레임 없이 촬영하므로 진행 상황은 썸네일로 보여준다. */}
        {shoot.shots.length > 0 ? (
          <View style={styles.shotStrip}>
            {shoot.shots.map((shot) => (
              <Image key={shot.id} source={{ uri: shot.uri }} style={styles.shotThumb} />
            ))}
          </View>
        ) : null}

        {permission && !permission.granted ? (
          <ActionButton
            label="카메라 권한 요청"
            onPress={() => void requestPermission()}
            variant="secondary"
          />
        ) : null}

        {/* 촬영 모드 토글: 타이머 / 수동. 촬영이 시작되면 잠긴다. */}
        <View style={styles.modeToggle}>
          {(
            [
              ['timer', '타이머'],
              ['manual', '수동'],
            ] as const
          ).map(([mode, label]) => {
            const active = captureMode === mode;
            return (
              <Pressable
                accessibilityLabel={`${label} 모드`}
                accessibilityRole="button"
                accessibilityState={{ disabled: sessionLocked, selected: active }}
                disabled={sessionLocked}
                key={mode}
                onPress={() => setCaptureMode(mode)}
                style={[styles.modeButton, active ? styles.modeButtonActive : null, sessionLocked ? styles.controlLocked : null]}>
                <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 타이머 간격 칩(3/5/8초). 타이머 모드에서만 노출되고, 촬영 시작 후에는 잠긴다. */}
        {captureMode === 'timer' ? (
          <View style={styles.timerChipRow}>
            {TIMER_OPTIONS.map((seconds) => {
              const active = timerSeconds === seconds;
              return (
                <Pressable
                  accessibilityLabel={`${seconds}초 간격`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: sessionLocked, selected: active }}
                  disabled={sessionLocked}
                  key={seconds}
                  onPress={() => setTimerSeconds(seconds)}
                  style={[styles.timerChip, active ? styles.timerChipActive : null, sessionLocked ? styles.controlLocked : null]}>
                  <Ionicons color={active ? '#000000' : colors.text} name="timer-outline" size={13} />
                  <Text style={[styles.timerChipText, active ? styles.timerChipTextActive : null]}>{seconds}s</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={styles.bodyText}>
            {!permission?.granted
              ? '카메라 권한을 허용하면 촬영을 시작할 수 있어요.'
              : captureMode === 'timer'
                ? `"촬영 시작"을 누르면 ${timerSeconds}초 간격으로 8장을 자동으로 찍어요.`
                : '셔터를 누를 때마다 한 장씩 총 8장을 찍어요.'}
          </Text>
          <Text style={styles.statusText}>카메라 {isCameraReady ? '준비 완료' : '아직 켜져 있지 않아요'}</Text>
        </View>

        {/* 셔터 영역: 큰 원형 셔터(핸드오프) + 카메라 전환 */}
        <View style={styles.shutterRow}>
          <Pressable
            accessibilityLabel="카메라 전환"
            accessibilityRole="button"
            disabled={sessionLocked}
            onPress={() => {
              // remount 동안 카메라가 다시 초기화되므로 준비 상태를 내려 UI에 반영한다.
              setIsCameraReady(false);
              setFacing((current) => (current === 'front' ? 'back' : 'front'));
            }}
            style={[styles.flipButton, sessionLocked ? styles.controlLocked : null]}>
            <Ionicons color={colors.text} name="camera-reverse-outline" size={18} />
          </Pressable>

          <Pressable
            accessibilityLabel={
              captureMode === 'manual' ? '한 장 촬영' : isShooting ? '지금 바로 촬영' : '촬영 시작'
            }
            accessibilityRole="button"
            onPress={() =>
              void (captureMode === 'manual'
                ? handleManualShutter()
                : isShooting
                  ? handleShootNow()
                  : handleTimerBurst())
            }
            style={styles.shutterButton}>
            <View style={styles.shutterInner} />
          </Pressable>

          <View style={styles.flipButtonSpacer} />
        </View>

        {shoot.shots.length >= SHOOT_TOTAL ? (
          <ActionButton label="촬영 결과 고르기" onPress={() => push('/shoot/select')} variant="ghost" />
        ) : null}
      </SurfaceCard>
    </AppScrollView>
  );
}

export function ShootSelectScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const styles = useShootStyles();
  const shoot = useShootStore();
  const selectedFrameId = shoot.frameId;
  const toggleShootSelection = useShootStore((state) => state.toggleShootSelection);
  const setShootOption = useShootStore((state) => state.setShootOption);

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
        <Text style={styles.bodyText}>찍은 {shoot.shots.length}장 중 4장을 순서대로 탭하세요.</Text>
        <View style={styles.mediaGrid}>
          {shoot.shots.map((item) => {
            const order = shoot.selectedShotIds.indexOf(item.id);
            const selected = order >= 0;
            return (
              <Pressable
                key={item.id}
                accessibilityLabel={`${item.label}${selected ? `, ${order + 1}번째로 선택됨` : ', 선택하기'}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleShootSelection(item.id)}
                style={[styles.mediaCard, selected ? styles.mediaCardSelected : null]}>
                <Image accessibilityLabel={item.label} accessibilityRole="image" source={{ uri: item.uri }} style={styles.mediaImage} />
                {selected ? (
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>{order + 1}</Text>
                  </View>
                ) : null}
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
  const accessMode = useSessionStore((state) => state.accessMode);
  const shoot = useShootStore();
  const selectedFrameId = shoot.frameId;
  const persistShootResult = useShootStore((state) => state.persistShootResult);
  const historyItems = useLibraryStore((state) => state.historyItems);
  const renameHistoryItem = useLibraryStore((state) => state.renameHistoryItem);
  const showGuestShareNotice = useSessionStore((state) => state.showGuestShareNotice);
  const showNotice = useSessionStore((state) => state.showNotice);
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
  // 사용자가 탭한 순서(selectedShotIds)를 보존해 미리보기/저장 결과가 일치하도록 한다.
  const previewMedia =
    currentHistory?.previewMedia ??
    shoot.selectedShotIds
      .map((id) => shoot.shots.find((shot) => shot.id === id))
      .filter((shot): shot is (typeof shoot.shots)[number] => shot !== undefined);

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
          <Pill>{isGuest ? '이미지 다운로드' : '이미지'}</Pill>
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <View collapsable={false} ref={previewRef}>
          <FramePreview accentColor={shoot.borderColor} frameId={selectedFrameId} media={previewMedia} tone={shoot.tone} />
        </View>
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
    bodyText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    controlLocked: {
      opacity: 0.45,
    },
    flipButton: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    flipButtonSpacer: {
      height: 44,
      width: 44,
    },
    modeButton: {
      alignItems: 'center',
      borderRadius: 999,
      flex: 1,
      height: 38,
      justifyContent: 'center',
    },
    modeButtonActive: {
      backgroundColor: '#FFFFFF',
    },
    modeButtonText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    modeButtonTextActive: {
      color: '#0B0B0C',
    },
    modeToggle: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.cardMuted,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 6,
      padding: 4,
    },
    shutterButton: {
      alignItems: 'center',
      borderColor: colors.text,
      borderRadius: 999,
      borderWidth: 4,
      height: 76,
      justifyContent: 'center',
      width: 76,
    },
    shutterInner: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      height: 56,
      width: 56,
    },
    shutterRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 28,
      justifyContent: 'center',
    },
    timerChip: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.cardMuted,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      height: 34,
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    timerChipActive: {
      backgroundColor: '#FFFFFF',
    },
    timerChipRow: {
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
    },
    timerChipText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    timerChipTextActive: {
      color: '#000000',
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
    cameraSlotPlaceholder: {
      alignItems: 'center',
      backgroundColor: colors.backgroundCanvas,
      flex: 1,
      justifyContent: 'center',
    },
    cameraStage: {
      backgroundColor: '#000000',
      borderRadius: 16,
      maxHeight: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
    },
    stageTall: {
      height: '100%',
    },
    stageWide: {
      width: '100%',
    },
    stageWrap: {
      alignItems: 'center',
      height: 420,
      justifyContent: 'center',
      position: 'relative',
    },
    shotStrip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'center',
    },
    shotThumb: {
      borderRadius: 8,
      height: 40,
      width: 40,
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
    orderBadge: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 999,
      height: 26,
      justifyContent: 'center',
      position: 'absolute',
      right: 8,
      top: 8,
      width: 26,
    },
    orderBadgeText: {
      color: '#06140A',
      fontSize: 13,
      fontWeight: '800',
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
    overlayHint: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 11,
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
