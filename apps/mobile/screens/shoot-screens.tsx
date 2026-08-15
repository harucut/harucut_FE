import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FRAME_LAYOUTS, FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, SurfaceCard } from '@/components/harucut/ui';
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
          emptyText="저장한 프레임이 없어요."
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
  // 이탈 확인창이 떠 있는 동안 자동 촬영을 멈춰 둔다. 안 멈추면 모달 뒤에서 계속 찍혀,
  // 사용자가 "계속 촬영"을 고르기도 전에 8장이 끝나고 선택 화면으로 넘어가 버린다.
  const burstPausedRef = useRef(false);
  // "나가기"를 고른 경우. 남은 컷을 더 찍지 않고 루프를 끝낸다.
  const burstAbortedRef = useRef(false);
  const { colors } = useHarucutTheme();
  const styles = useShootStyles();
  const shoot = useShootStore();
  const addShootShot = useShootStore((state) => state.addShootShot);
  const resetShootSession = useShootStore((state) => state.resetShootSession);
  const showNotice = useSessionStore((state) => state.showNotice);
  const notice = useSessionStore((state) => state.notice);
  const [facing, setFacing] = useState<CameraType>('front');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isShooting, setIsShooting] = useState(false);
  // 타이머 간격은 시작 전에만 고른다(시작하면 선택 UI 자체가 사라진다).
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(3);
  const layout = shoot.frameId ? FRAME_LAYOUTS[shoot.frameId] : null;
  const slotCount = layout ? layout.slots.length : 4;
  // 8장을 슬롯 수로 순환 — 지금 찍는 칸 인덱스.
  const cameraSlotIndex = shoot.shots.length % slotCount;
  // 촬영 중에는 프레임을 씌우지 않고, 선택한 프레임의 슬롯 비율만 카메라 프리뷰에 반영한다.
  // 프레임(테두리·데코)은 사진을 배치하는 다음 단계부터 보인다.
  const currentSlot = layout ? layout.slots[cameraSlotIndex] : null;
  const isTallSlot = currentSlot ? currentSlot.width / currentSlot.height < 1 : true;
  // 세션이 시작되면(촬영 중이거나 이미 한 장 이상 찍었으면) 간격 선택·카메라 전환을 잠근다.
  const sessionLocked = isShooting || shoot.shots.length > 0;

  useEffect(() => {
    if (!shoot.frameId) {
      router.replace('/shoot' as never);
    }
  }, [router, shoot.frameId]);

  // 캡처 화면에 진입할 때마다 이전(완료·중단)된 세션의 촬영본을 비운다.
  // resetShootSession은 frameId/선택 프레임은 유지하고 shots만 초기화하므로,
  // 재촬영 진입 시 촬영 간격을 다시 고를 수 있다.
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

  /**
   * 촬영본이 있는 상태의 이탈을 한 번 확인받는다.
   *
   * 촬영본이 없으면 확인 없이 그대로 나간다(돌려주는 false로 호출부가 판단).
   * 안드로이드 하드웨어 백과 헤더의 "프레임 다시 선택"이 같은 흐름을 쓴다 —
   * 하드웨어 백이 없는 iOS에서는 헤더가 주된 이탈 수단이라, 한쪽만 막으면 의미가 없다.
   */
  const confirmLeaveCapture = useCallback(() => {
    if (shoot.shots.length === 0) return false;
    // 사용자가 고르는 동안 자동 촬영을 멈춘다. 재개는 확인창이 닫힐 때 아래 effect가 맡는다
    // (배경 탭이나 모달 백버튼으로 닫아도 멈춘 채로 남지 않게).
    burstPausedRef.current = true;
    showNotice({
      actions: [
        // id는 GlobalNotice에서 React key로도 쓰이므로 액션마다 달라야 한다.
        // 둘 다 'dismiss'면 키가 겹쳐 버튼이 누락되거나 이전 핸들러가 재사용된다.
        { id: 'dismiss', label: '계속 촬영', variant: 'secondary' },
        {
          id: 'leave-capture',
          label: '나가기',
          variant: 'danger',
          onPress: () => {
            burstAbortedRef.current = true;
            burstPausedRef.current = false;
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
  }, [shoot.shots.length, showNotice, resetShootSession, router]);

  // 화면이 포커스일 때만 하드웨어 백 이벤트를 가로챈다.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        confirmLeaveCapture,
      );
      return () => subscription.remove();
    }, [confirmLeaveCapture]),
  );

  // 확인창이 닫히면 자동 촬영을 재개한다. "계속 촬영" 버튼뿐 아니라 배경 탭·모달 백버튼으로
  // 닫는 경로도 있어서, 버튼 핸들러가 아니라 노티스가 사라지는 시점을 기준으로 푼다.
  // "나가기"를 고른 경우는 burstAbortedRef가 이미 서 있어 재개해도 루프가 곧바로 끝난다.
  useEffect(() => {
    if (!notice) {
      burstPausedRef.current = false;
    }
  }, [notice]);

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

    // 셔터 햅틱 — 물리 셔터 감각. 미지원 기기에서 던지는 에러는 무시(촬영 흐름 방해 금지).
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const picture = await cameraRef.current.takePictureAsync({
      quality: 0.6,
      shutterSound: false,
      skipProcessing: true,
    });

    // takePictureAsync는 수백 ms가 걸린다. 그 사이 "나가기"를 골랐거나 화면을 벗어났으면
    // 결과를 버린다. 안 그러면 방금 비운 전역 스토어에 사진 한 장과 선택 id가 되살아나,
    // 지웠다고 안내한 촬영본이 /shoot에 남는다.
    if (shouldStopBurst()) return shotIndex;

    const asset: MediaAsset = {
      id: `shoot-shot-${Date.now()}-${shotIndex}`,
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

  // 확인창이 닫힐 때까지(또는 화면을 벗어날 때까지) 카운트다운을 붙잡아 둔다.
  const waitWhileBurstPaused = async () => {
    while (burstPausedRef.current && isMountedRef.current && !burstAbortedRef.current) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  };

  // 루프를 더 진행하면 안 되는 상태인지 한 곳에서 판단한다.
  const shouldStopBurst = () => !isMountedRef.current || burstAbortedRef.current;

  // 촬영 시작: 선택한 간격으로 8장을 자동 연속 촬영.
  // 카운트다운 중 셔터를 탭하면 남은 대기를 스킵하고 그 컷을 즉시 찍는다(captureNowRef + tickResolveRef로 틱 인터럽트).
  const handleTimerBurst = async () => {
    if (!(await ensureCameraPermission())) return;
    if (!cameraRef.current || isShooting) return;

    resetShootSession();
    captureNowRef.current = false;
    burstPausedRef.current = false;
    burstAbortedRef.current = false;
    setIsShooting(true);

    try {
      for (let shotIndex = 0; shotIndex < SHOOT_TOTAL; shotIndex += 1) {
        // 컷마다 스킵 플래그를 초기화해, 직전 컷의 탭이 다음 컷으로 새지 않게 한다.
        captureNowRef.current = false;

        for (let remaining = timerSeconds; remaining > 0; remaining -= 1) {
          // 이탈 확인창이 떠 있으면 여기서 멈춰 선다.
          await waitWhileBurstPaused();
          // 카운트다운 도중 화면을 벗어났거나 나가기를 골랐으면 즉시 중단
          // (언마운트 후 setState 방지).
          if (shouldStopBurst()) return;
          // 셔터를 탭했으면 남은 카운트다운을 건너뛴다.
          if (captureNowRef.current) break;
          setCountdown(remaining);
          // 1초 틱으로 맞춰 선택한 간격(3·5·8초)이 실제 촬영 간격과 일치하게 한다(탭하면 조기 종료).
          await waitTickOrSkip();
          if (captureNowRef.current) break;
        }

        // 촬영 직전 확인창이 떴으면 셔터를 누르지 않고 기다린다.
        await waitWhileBurstPaused();
        // 촬영 직전 이탈했으면 더 찍지 않는다.
        if (shouldStopBurst()) return;
        captureNowRef.current = false;
        await captureOneShot(shotIndex);
      }

      // 완료 직전 이탈했으면 화면 전환하지 않는다.
      if (shouldStopBurst()) return;
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

  return (
    <AppScrollView>
      <PageHeader
        backLabel="프레임 다시 선택"
        // 하드웨어 백과 같은 확인 흐름을 태운다. 확인창을 띄웠으면 여기서 이동하지 않는다.
        onPressBack={() => {
          if (confirmLeaveCapture()) return;
          push('/shoot');
        }}
        title="사진 촬영"
      />

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
            </View>
          ) : null}
        </View>

        {/* 촬영 중에는 찍은 컷을 보여주지 않는다 — 촬영에만 집중하고, 확인은 다음 단계에서. */}

        {permission && !permission.granted ? (
          <ActionButton
            label="카메라 권한 요청"
            onPress={() => void requestPermission()}
            variant="secondary"
          />
        ) : null}

        {/* 촬영 간격 칩(3/5/8초) — 시작 전에만 고른다. 시작하면 통째로 사라진다. */}
        {sessionLocked ? null : (
          <View style={styles.timerChipRow}>
            {TIMER_OPTIONS.map((seconds) => {
              const active = timerSeconds === seconds;
              return (
                <Pressable
                  accessibilityLabel={`${seconds}초 간격`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={seconds}
                  onPress={() => setTimerSeconds(seconds)}
                  style={[styles.timerChip, active ? styles.timerChipActive : null]}>
                  <Ionicons color={active ? '#000000' : colors.text} name="timer-outline" size={13} />
                  <Text style={[styles.timerChipText, active ? styles.timerChipTextActive : null]}>{seconds}s</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ gap: 8 }}>
          {permission?.granted ? null : (
            <Text style={styles.bodyText}>카메라 권한을 허용하면 촬영을 시작할 수 있어요.</Text>
          )}
          <Text style={styles.statusText}>카메라 {isCameraReady ? '준비 완료' : '아직 켜져 있지 않아요'}</Text>
        </View>

        {/* 셔터 영역 — 전환 버튼을 absolute로 빼서, 메인 버튼이 그 유무와 무관하게
            항상 좌우 정중앙에 오게 한다(예전 좌우 스페이서 방식은 중앙이 어긋났다). */}
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

          {/* 시작 전엔 '촬영 시작', 촬영 중엔 언제든 눌러 남은 대기를 건너뛰고 즉시 한 컷. */}
          <Pressable
            accessibilityLabel={isShooting ? '지금 바로 촬영' : '촬영 시작'}
            accessibilityRole="button"
            onPress={() => void (isShooting ? handleShootNow() : handleTimerBurst())}
            style={styles.shutterPress}>
            <View style={styles.shutterButton}>
              <View style={styles.shutterInner} />
            </View>
            <Text style={styles.shutterLabel}>{isShooting ? '바로 촬영' : '촬영 시작'}</Text>
          </Pressable>
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
        title="사진 선택"
      />

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
          label={selectedCount === 4 ? '다음 단계로' : '4장을 골라 주세요'}
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
  // 서버 기록의 previewMedia는 4컷을 합성한 "결과물 1장"이라 슬롯 배열로 쓰면 안 된다
  // (저장 성공 직후 미리보기가 1컷으로 붕괴하고, 그 화면을 다시 캡처해 내려받게 된다).
  const previewMedia = shoot.selectedShotIds
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

      <SurfaceCard style={{ gap: 10 }}>
        <View style={styles.statusRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.sectionTitle}>결과 준비 완료</Text>
            <Text style={styles.bodyText}>
              {isGuest
                ? '체험 결과는 기기에 바로 저장할 수 있어요. 링크 공유와 기록 저장은 로그인 후 사용할 수 있어요.'
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
            지금은 이미지 저장을 체험할 수 있어요. 링크 공유, 기록 저장, 업로드 제작은 로그인 후에 이용할 수 있어요. 이 결과는 화면을 벗어나면 사라져요.
          </Text>
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="download-outline" size={16} />}
            label="이미지 다운로드"
            onPress={() => void handleDownload()}
          />
          <ActionButton
            icon={<Ionicons color={colors.text} name="share-social-outline" size={16} />}
            label="링크 공유는 로그인 후에 이용할 수 있어요"
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
          label={isGuest ? '로그인하고 계속하기' : '홈으로 가기'}
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
    // 전환 버튼은 좌측에 절대 배치 — 셔터가 항상 행의 정중앙에 오게 한다.
    flipButton: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      width: 44,
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
    shutterLabel: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    shutterPress: {
      alignItems: 'center',
      gap: 6,
    },
    shutterRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      position: 'relative',
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
