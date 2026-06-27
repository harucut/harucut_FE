import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FramePreview } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, BrandMark, FormField, Pill, SurfaceCard } from '@/components/harucut/ui';
import type { HistoryItem } from '@/constants/harucut-data';
import type { HarucutThemePreference } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { changePassword, exitAccount, logout } from '@/lib/auth-api';
import { getApiErrorMessage } from '@/lib/api-client';
import { validatePassword } from '@/lib/auth-validation';
import { uploadLocalFileWithPresigned } from '@/lib/file-storage-api';
import { saveRemoteMediaToLibrary, shareMediaLink } from '@/lib/media-download';
import { updateProfileImage, updateUsername } from '@/lib/user-api';
import { getMediaDownloadUrl } from '@/lib/user-media-api';
import { useLibraryStore } from '@/store/use-library-store';
import { useSessionStore } from '@/store/use-session-store';

type HarucutThemeColors = ReturnType<typeof useHarucutTheme>['colors'];

const THEME_OPTIONS: Array<{
  description: string;
  label: string;
  value: HarucutThemePreference;
}> = [
  {
    description: '기기 설정에 맞춰 자동으로 전환해요.',
    label: '기본값',
    value: 'system',
  },
  {
    description: '항상 밝은 화면으로 볼 수 있어요.',
    label: '라이트',
    value: 'light',
  },
  {
    description: '어두운 화면으로 편하게 볼 수 있어요.',
    label: '다크',
    value: 'dark',
  },
];

// 핸드오프 app MyPage의 그룹 메뉴 행 구성(순서·아이콘·서브카피 동일)
type MyMenuId = 'account' | 'plan' | 'notif' | 'frames' | 'pref';

function historyPreviewAsset(item: HistoryItem) {
  return item.previewMedia[0] ?? null;
}

function historyPreviewUri(item: HistoryItem) {
  return historyPreviewAsset(item)?.uri ?? '';
}

function formatDate(value: string) {
  if (!value) {
    return '날짜 없음';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '날짜 없음';
  }

  return date.toLocaleString('ko-KR', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
  });
}

const HISTORY_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const HISTORY_MONTH_KO = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
] as const;

// createdAt 기준 YYYY-MM 키. 날짜 정보가 없으면 null.
function historyMonthKey(item: HistoryItem): string | null {
  if (!item.createdAt) {
    return null;
  }

  const date = new Date(item.createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function historyMonthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const prefix = year === new Date().getFullYear() ? '' : `${year}년 `;
  return `${prefix}${HISTORY_MONTH_KO[(month ?? 1) - 1]}`;
}

// createdAt 기준 월별 그룹(최신순). 날짜 없는 항목은 'unknown'으로 마지막에 묶는다.
function groupHistoryByMonth(items: HistoryItem[]): Array<{ items: HistoryItem[]; key: string }> {
  const map = new Map<string, HistoryItem[]>();

  for (const item of items) {
    const key = historyMonthKey(item) ?? 'unknown';
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return [...map.keys()]
    .sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return a < b ? 1 : -1;
    })
    .map((key) => ({ items: map.get(key) ?? [], key }));
}

async function resolveHistoryMediaUrl(item: HistoryItem) {
  if (item.mediaId) {
    try {
      return await getMediaDownloadUrl(item.mediaId);
    } catch {
      // 서명 URL 재발급 실패 시 미리보기 URL로 대체합니다.
    }
  }

  return historyPreviewUri(item);
}

const WEEKDAY_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// 핸드오프와 동일한 주간 목표 컷 수(임의 상수). 진행 링/남은 컷 계산 기준.
const WEEKLY_GOAL = 5;

// 핸드오프와 동일한 "2026.06.12 · 금요일" 표기.
function formatCurrentDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  return `${yyyy}.${mm}.${dd} · ${WEEKDAY_KO[now.getDay()]}`;
}

function countThisMonth(items: HistoryItem[]) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return items.filter((item) => {
    if (!item.createdAt) return false;
    const date = new Date(item.createdAt);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === y && date.getMonth() === m;
  }).length;
}

function countThisWeek(items: HistoryItem[]) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  // 월요일 기준 이번 주 시작(0=일..6=토 -> 월요일까지 경과일).
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const startMs = weekStart.getTime();
  return items.filter((item) => {
    if (!item.createdAt) return false;
    const date = new Date(item.createdAt);
    return !Number.isNaN(date.getTime()) && date.getTime() >= startMs;
  }).length;
}

function getNextDateRefreshDelay() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 1, 0);

  return Math.max(nextMidnight.getTime() - now.getTime(), 1000);
}

function useCurrentDateLabel() {
  const [dateLabel, setDateLabel] = useState(formatCurrentDate);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const refresh = () => {
      setDateLabel(formatCurrentDate());
      timeoutId = setTimeout(refresh, getNextDateRefreshDelay());
    };

    timeoutId = setTimeout(refresh, getNextDateRefreshDelay());

    return () => clearTimeout(timeoutId);
  }, []);

  return dateLabel;
}

function useAppScreenTheme() {
  const { colors, isDark } = useHarucutTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return { colors, isDark, styles };
}

// react-native-svg 없이 두 개의 반원(좌/우 클립)으로 그리는 진행 링.
// (핸드오프 app 홈 스탯 카드의 그린 진행 링)
// 각 반원은 한쪽 테두리만 progress 색으로 칠한 원을 회전시켜 호를 만든다.
function HalfRing({
  size,
  stroke,
  color,
  side,
  rotate,
}: {
  color: string;
  rotate: number;
  side: 'left' | 'right';
  size: number;
  stroke: number;
}) {
  const half = size / 2;
  return (
    <View
      style={{
        height: size,
        left: side === 'right' ? half : 0,
        overflow: 'hidden',
        position: 'absolute',
        top: 0,
        width: half,
      }}>
      <View
        style={{
          // 오른쪽/위 테두리만 색을 칠해 한쪽 반원 호를 만든다.
          borderBottomColor: 'transparent',
          borderLeftColor: 'transparent',
          borderRadius: half,
          borderRightColor: side === 'right' ? color : 'transparent',
          borderTopColor: color,
          borderWidth: stroke,
          height: size,
          left: side === 'right' ? -half : 0,
          position: 'absolute',
          top: 0,
          transform: [{ rotate: `${rotate}deg` }],
          width: size,
        }}
      />
    </View>
  );
}

function ProgressRing({
  pct,
  size = 46,
  stroke = 5,
  trackColor,
  progressColor,
}: {
  pct: number;
  progressColor: string;
  size?: number;
  stroke?: number;
  trackColor: string;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const half = size / 2;
  // 12시 방향(=-135deg 기준)에서 시계방향으로 진행. 오른쪽 반원이 먼저 채워진다.
  const firstRotate = -135 + Math.min(clamped, 0.5) * 360;
  const secondRotate = -135 + Math.max(clamped - 0.5, 0) * 360;

  return (
    <View style={{ height: size, width: size }}>
      <View
        style={{
          borderColor: trackColor,
          borderRadius: half,
          borderWidth: stroke,
          height: size,
          position: 'absolute',
          width: size,
        }}
      />
      {clamped > 0 ? (
        <HalfRing
          color={progressColor}
          rotate={firstRotate}
          side="right"
          size={size}
          stroke={stroke}
        />
      ) : null}
      {clamped > 0.5 ? (
        <HalfRing
          color={progressColor}
          rotate={secondRotate}
          side="left"
          size={size}
          stroke={stroke}
        />
      ) : null}
    </View>
  );
}

export function HomeScreen() {
  const { colors, styles } = useAppScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const historyItems = useLibraryStore((state) => state.historyItems);
  const historyError = useLibraryStore((state) => state.historyError);
  const historyStatus = useLibraryStore((state) => state.historyStatus);
  const loadRemoteFrames = useLibraryStore((state) => state.loadRemoteFrames);
  const accessMode = useSessionStore((state) => state.accessMode);
  const loadRemoteHistory = useLibraryStore((state) => state.loadRemoteHistory);
  const savedFrames = useLibraryStore((state) => state.savedFrames);
  const user = useSessionStore((state) => state.user);

  const todayMoment = useCurrentDateLabel();
  const recentItems = historyItems.slice(0, 4);
  const isHistoryLoading =
    historyStatus === 'loading' ||
    (accessMode === 'member' && historyStatus === 'idle');

  useEffect(() => {
    if (accessMode === 'member' && historyStatus === 'idle') {
      void loadRemoteHistory();
    }
  }, [accessMode, historyStatus, loadRemoteHistory]);

  useEffect(() => {
    if (accessMode === 'member') {
      void loadRemoteFrames();
    }
  }, [accessMode, loadRemoteFrames]);

  // todayMoment(날짜 라벨)을 의존성에 포함해 자정·주·월 경계를 넘기면 수치도 재계산.
  const monthCount = useMemo(
    () => countThisMonth(historyItems),
    [historyItems, todayMoment],
  );
  const weekCount = useMemo(
    () => countThisWeek(historyItems),
    [historyItems, todayMoment],
  );
  const remainingToGoal = Math.max(0, WEEKLY_GOAL - weekCount);
  const ringPct = WEEKLY_GOAL > 0 ? Math.min(1, weekCount / WEEKLY_GOAL) : 0;

  return (
    <AppScrollView>
      <View style={styles.homeTopBar}>
        <BrandMark compact href="/home" />
        <Pressable
          accessibilityLabel="알림"
          accessibilityRole="button"
          onPress={() => push('/mypage')}
          style={styles.topIconButton}>
          <Ionicons color={colors.text} name="notifications-outline" size={20} />
        </Pressable>
      </View>

      <View style={styles.greetingBlock}>
        <Text style={styles.dateEyebrow}>{todayMoment}</Text>
        <Text style={styles.greetingTitle}>{user.username}님, 하루는</Text>
        <Text style={styles.greetingAccent}>어떤 네 컷일까요?</Text>
      </View>

      <Pressable
        accessibilityLabel="지금 촬영하기"
        accessibilityRole="button"
        onPress={() => push('/shoot')}
        style={({ pressed }) => [styles.heroCta, pressed ? styles.pressedSoft : null]}>
        <View style={styles.heroCtaIcon}>
          <Ionicons color={colors.primary} name="camera" size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroCtaTitle}>지금 촬영하기</Text>
          <Text style={styles.heroCtaSubtitle}>프레임 고르고 8장 찍기</Text>
        </View>
        <Ionicons color="#06140A" name="chevron-forward" size={22} />
      </Pressable>

      <View style={styles.quickRow}>
        <Pressable
          accessibilityLabel="사진 불러오기"
          accessibilityRole="button"
          onPress={() => push('/upload')}
          style={({ pressed }) => [styles.quickCard, pressed ? styles.pressedSoft : null]}>
          <Ionicons color={colors.primaryStrong} name="image-outline" size={22} />
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>사진 불러오기</Text>
            <Text style={styles.quickSubtitle}>갤러리에서</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="프레임 꾸미기"
          accessibilityRole="button"
          onPress={() => push('/theme')}
          style={({ pressed }) => [styles.quickCard, pressed ? styles.pressedSoft : null]}>
          <Ionicons color={colors.primaryStrong} name="sparkles-outline" size={22} />
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>프레임 보기</Text>
            <Text style={styles.quickSubtitle}>4가지 테마</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.statStrip}>
        <Text style={styles.statNumber}>{monthCount}</Text>
        <Text style={styles.statCopy}>
          이번 달 <Text style={styles.statCopyStrong}>{monthCount}컷</Text>을 남겼어요.{'\n'}
          이번 주 목표까지 <Text style={styles.statCopyAccent}>{remainingToGoal}컷</Text> 남았어요!
        </Text>
        <ProgressRing
          progressColor={colors.primary}
          pct={ringPct}
          trackColor={colors.border}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>최근 기록</Text>
        <Text onPress={() => push('/history')} style={styles.inlineLink}>
          전체보기
        </Text>
      </View>

      <View style={styles.recentGrid}>
        {isHistoryLoading ? (
          Array.from({ length: 4 }, (_, index) => (
            <View key={`recent-loading-${index}`} style={[styles.thumbCard, styles.thumbLoading]} />
          ))
        ) : recentItems.length > 0 ? (
          recentItems.map((item) => {
            const previewAsset = historyPreviewAsset(item);
            const previewKind = previewAsset?.previewKind ?? previewAsset?.kind;
            const previewUri = previewAsset?.uri ?? '';

            return (
              <View key={item.id} style={styles.recentTile}>
                <View style={styles.thumbCard}>
                  {previewUri && previewKind === 'image' ? (
                    <>
                      <Image resizeMode="contain" source={{ uri: previewUri }} style={styles.thumbImage} />
                      <View style={styles.thumbTypeBadge}>
                        <Ionicons
                          color="#FFFFFF"
                          name="image"
                          size={11}
                        />
                        <Text style={styles.thumbTypeText}>사진</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons
                        color={colors.primary}
                        name="image-outline"
                        size={24}
                      />
                      <Text style={styles.thumbPlaceholderText}>
                        미리보기 없음
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ gap: 2 }}>
                  <Text numberOfLines={1} style={styles.thumbTitle}>
                    {item.title}
                  </Text>
                  <Text style={styles.thumbMeta}>{formatDate(item.createdAt)}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.recentEmptyCard}>
            <Text style={styles.linkTitle}>아직 저장한 결과가 없어요.</Text>
            <Text style={styles.linkBody}>
              {historyStatus === 'error'
                ? (historyError ?? '저장한 결과를 불러오지 못했어요.')
                : '촬영하거나 업로드하면 여기에 표시돼요.'}
            </Text>
          </View>
        )}
      </View>

    </AppScrollView>
  );
}

export function HistoryScreen() {
  const { colors, styles } = useAppScreenTheme();
  const accessMode = useSessionStore((state) => state.accessMode);
  const historyError = useLibraryStore((state) => state.historyError);
  const historyItems = useLibraryStore((state) => state.historyItems);
  const historyStatus = useLibraryStore((state) => state.historyStatus);
  const loadRemoteHistory = useLibraryStore((state) => state.loadRemoteHistory);
  const renameHistoryItem = useLibraryStore((state) => state.renameHistoryItem);
  const showNotice = useSessionStore((state) => state.showNotice);
  const [filter, setFilter] = useState<'ALL' | 'PHOTO'>('ALL');
  const [view, setView] = useState<'grid' | 'calendar'>('grid');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState<string | null>(null);

  const handleDownloadItem = async (item: HistoryItem) => {
    setBusyId(item.id);

    try {
      const url = await resolveHistoryMediaUrl(item);
      const result = await saveRemoteMediaToLibrary(url, item.title, item.kind);

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
      setBusyId(null);
    }
  };

  const handleShareItem = async (item: HistoryItem) => {
    try {
      const url = await resolveHistoryMediaUrl(item);
      await shareMediaLink(item.title, url);
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

  const filteredItems = useMemo(() => {
    if (filter === 'ALL') {
      return historyItems;
    }

    return historyItems.filter((item) => item.kind === 'photo');
  }, [filter, historyItems]);

  const monthGroups = useMemo(() => groupHistoryByMonth(filteredItems), [filteredItems]);

  // 달력용: 날짜가 있는 월만 모아 최신순 정렬.
  const calendarMonths = useMemo(() => {
    const keys = new Set<string>();
    for (const item of historyItems) {
      const key = historyMonthKey(item);
      if (key) {
        keys.add(key);
      }
    }
    return [...keys].sort((a, b) => (a < b ? 1 : -1));
  }, [historyItems]);

  const activeMonth =
    monthCursor && calendarMonths.includes(monthCursor) ? monthCursor : calendarMonths[0] ?? null;

  const isHistoryLoading =
    historyStatus === 'loading' ||
    (accessMode === 'member' && historyStatus === 'idle');

  useEffect(() => {
    if (accessMode === 'member' && historyStatus === 'idle') {
      void loadRemoteHistory();
    }
  }, [accessMode, historyStatus, loadRemoteHistory]);

  const renderHistoryCard = (item: HistoryItem) => {
    const previewAsset = historyPreviewAsset(item);
    const previewKind = previewAsset?.previewKind ?? previewAsset?.kind;
    const previewUri = previewAsset?.uri ?? '';
    const isEditing = editingId === item.id;

    return (
      <View key={item.id} style={styles.historyTile}>
        <View style={styles.thumbCard}>
          {previewUri && previewKind === 'image' ? (
            <Image resizeMode="contain" source={{ uri: previewUri }} style={styles.thumbImage} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons
                color={colors.primary}
                name="image-outline"
                size={24}
              />
              <Text style={styles.thumbPlaceholderText}>
                미리보기 없음
              </Text>
            </View>
          )}
          <View style={styles.thumbTypeBadge}>
            <Ionicons color="#FFFFFF" name="image" size={11} />
            <Text style={styles.thumbTypeText}>사진</Text>
          </View>
        </View>

        <View style={{ gap: 2 }}>
          {isEditing ? (
            <FormField label="파일 이름" onChangeText={setDraftName} value={draftName} />
          ) : (
            <Text numberOfLines={1} style={styles.thumbTitle}>
              {item.title}
            </Text>
          )}
          <Text style={styles.thumbMeta}>{formatDate(item.createdAt)}</Text>
        </View>

        <View style={styles.historyTileActions}>
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="download-outline" size={14} />}
            label={busyId === item.id ? '저장 중' : '저장'}
            onPress={() => void handleDownloadItem(item)}
            style={styles.historyTileButton}
          />
          <ActionButton
            icon={<Ionicons color={colors.text} name="share-social-outline" size={14} />}
            label="공유"
            onPress={() => void handleShareItem(item)}
            style={styles.historyTileButton}
            variant="secondary"
          />
          <ActionButton
            icon={<Ionicons color={colors.text} name="create-outline" size={14} />}
            label={isEditing ? '저장' : '이름'}
            onPress={() => {
              if (isEditing) {
                void renameHistoryItem(item.id, draftName.trim() || item.title)
                  .then(() => setEditingId(null))
                  .catch((error) =>
                    showNotice({
                      actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
                      eyebrow: 'SAVE ERROR',
                      icon: 'warning-outline',
                      message: getApiErrorMessage(error, '파일 이름을 저장하지 못했어요.'),
                      title: '이름 변경 실패',
                    }),
                  );
                return;
              }

              setEditingId(item.id);
              setDraftName(item.title);
            }}
            style={styles.historyTileButton}
            variant="ghost"
          />
        </View>
      </View>
    );
  };

  return (
    <AppScrollView>
      <View style={styles.historyTopBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateEyebrow}>MEMORY ARCHIVE</Text>
          <Text style={styles.greetingTitle}>기록</Text>
        </View>
        <View style={styles.viewToggle}>
          {(
            [
              { icon: 'grid', id: 'grid', label: '그리드 보기' },
              { icon: 'calendar', id: 'calendar', label: '달력 보기' },
            ] as const
          ).map(({ icon, id, label }) => {
            const active = view === id;
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={id}
                onPress={() => setView(id)}
                style={[styles.viewToggleButton, active ? styles.viewToggleButtonActive : null]}>
                <Ionicons color={active ? '#0B0B0C' : colors.muted} name={icon} size={15} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {view === 'grid' ? (
        <View style={styles.filterRow}>
          {(['ALL', 'PHOTO'] as const).map((value) => (
            <Pill key={value} active={filter === value} onPress={() => setFilter(value)}>
              {value === 'ALL' ? '전체' : '사진'}
            </Pill>
          ))}
        </View>
      ) : null}

      {isHistoryLoading ? (
        <SurfaceCard>
          <Text style={styles.bodyCopy}>저장한 기록을 불러오는 중이에요.</Text>
        </SurfaceCard>
      ) : historyStatus === 'error' ? (
        <SurfaceCard>
          <Text style={styles.bodyCopy}>{historyError ?? '저장한 기록을 불러오지 못했어요.'}</Text>
        </SurfaceCard>
      ) : view === 'calendar' ? (
        <HistoryCalendar
          activeMonth={activeMonth}
          colors={colors}
          items={historyItems}
          months={calendarMonths}
          onChangeMonth={setMonthCursor}
          styles={styles}
        />
      ) : filteredItems.length === 0 ? (
        <SurfaceCard>
          <Text style={styles.bodyCopy}>
            {filter === 'PHOTO'
              ? '저장한 사진 기록이 아직 없어요.'
              : '저장한 기록이 아직 없어요.'}
          </Text>
        </SurfaceCard>
      ) : (
        monthGroups.map((group) => (
          <View key={group.key} style={{ gap: 13 }}>
            <View style={styles.monthHeader}>
              <Text style={styles.monthHeaderTitle}>
                {group.key === 'unknown' ? '기타' : historyMonthLabel(group.key)}
              </Text>
              <Text style={styles.monthHeaderCount}>{group.items.length}컷</Text>
            </View>
            <View style={styles.historyGrid}>{group.items.map(renderHistoryCard)}</View>
          </View>
        ))
      )}
    </AppScrollView>
  );
}

function HistoryCalendar({
  activeMonth,
  colors,
  items,
  months,
  onChangeMonth,
  styles,
}: {
  activeMonth: string | null;
  colors: HarucutThemeColors;
  items: HistoryItem[];
  months: string[];
  onChangeMonth: (key: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!activeMonth) {
    return (
      <SurfaceCard>
        <Text style={styles.bodyCopy}>달력으로 볼 기록이 아직 없어요.</Text>
      </SurfaceCard>
    );
  }

  const [year, month] = activeMonth.split('-').map(Number);
  const monthItems = items.filter((item) => historyMonthKey(item) === activeMonth);

  const byDay = new Map<number, HistoryItem[]>();
  for (const item of monthItems) {
    if (!item.createdAt) {
      continue;
    }
    const day = new Date(item.createdAt).getDate();
    const bucket = byDay.get(day);
    if (bucket) {
      bucket.push(item);
    } else {
      byDay.set(day, [item]);
    }
  }

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(d);
  }

  const monthIndex = months.indexOf(activeMonth);
  const hasOlder = monthIndex < months.length - 1;
  const hasNewer = monthIndex > 0;

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.calendarNav}>
        <Pressable
          accessibilityLabel="이전 달"
          accessibilityRole="button"
          disabled={!hasOlder}
          onPress={() => hasOlder && onChangeMonth(months[monthIndex + 1])}
          style={[styles.calendarNavButton, hasOlder ? null : styles.calendarNavButtonDisabled]}>
          <Ionicons color={colors.text} name="chevron-back" size={16} />
        </Pressable>
        <Text style={styles.calendarNavTitle}>
          {year}년 {month}월 · {monthItems.length}컷
        </Text>
        <Pressable
          accessibilityLabel="다음 달"
          accessibilityRole="button"
          disabled={!hasNewer}
          onPress={() => hasNewer && onChangeMonth(months[monthIndex - 1])}
          style={[styles.calendarNavButton, hasNewer ? null : styles.calendarNavButtonDisabled]}>
          <Ionicons color={colors.text} name="chevron-forward" size={16} />
        </Pressable>
      </View>

      <View style={styles.calendarWeekRow}>
        {HISTORY_WEEKDAYS.map((label, index) => (
          <Text
            key={label}
            style={[
              styles.calendarWeekday,
              index === 0
                ? styles.calendarWeekdaySun
                : index === 6
                  ? styles.calendarWeekdaySat
                  : null,
            ]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {cells.map((day, index) => {
          const list = day ? byDay.get(day) : undefined;

          return (
            <View
              key={`${activeMonth}-${index}`}
              style={[styles.calendarCell, day ? styles.calendarCellFilled : null]}>
              {day ? (
                <Text style={[styles.calendarDay, list ? styles.calendarDayActive : null]}>{day}</Text>
              ) : null}
              {list ? (
                <View style={styles.calendarCellPreview}>
                  <FramePreview frameId={list[0].frameId} media={list[0].previewMedia} />
                  {list.length > 1 ? (
                    <View style={styles.calendarBadge}>
                      <Text style={styles.calendarBadgeText}>+{list.length - 1}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function MyPageScreen() {
  const { colors, styles } = useAppScreenTheme();
  const router = useRouter();
  const replace = (path: string) => router.replace(path as never);
  const push = (path: string) => router.push(path as never);
  const user = useSessionStore((state) => state.user);
  const refreshUserProfile = useSessionStore((state) => state.refreshUserProfile);
  const setUserProfile = useSessionStore((state) => state.setUserProfile);
  const enterAnonymousMode = useSessionStore((state) => state.enterAnonymousMode);
  const showNotice = useSessionStore((state) => state.showNotice);
  const themePreference = useSessionStore((state) => state.themePreference);
  const setThemePreference = useSessionStore((state) => state.setThemePreference);
  const historyItems = useLibraryStore((state) => state.historyItems);
  const savedCount = historyItems.length;
  const savedFrameCount = useLibraryStore((state) => state.savedFrames.length);
  const thisMonthCount = useMemo(() => {
    const now = new Date();
    return historyItems.filter((item) => {
      const created = new Date(item.createdAt);
      if (Number.isNaN(created.getTime())) {
        return false;
      }
      return (
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth()
      );
    }).length;
  }, [historyItems]);
  const [openSection, setOpenSection] = useState<MyMenuId | null>(null);
  const [username, setUsername] = useState(user.username);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setUsername(user.username);
  }, [user.username]);

  const showError = (title: string, message: string) => {
    showNotice({
      actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
      eyebrow: 'ACCOUNT ERROR',
      icon: 'warning-outline',
      message,
      title,
    });
  };

  const handlePickProfile = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setSubmitting(true);

      try {
        const asset = result.assets[0];
        const uploaded = await uploadLocalFileWithPresigned({
          filename: asset.fileName ?? 'profile.jpg',
          isTemp: false,
          type: 'PROFILE',
          uri: asset.uri,
        });
        await updateProfileImage(uploaded.key);
        setUserProfile({ profileUrl: uploaded.objectUrl });
        await refreshUserProfile();
      } catch (error) {
        showError('프로필 이미지 변경 실패', getApiErrorMessage(error, '프로필 이미지를 변경하지 못했어요.'));
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleUpdateUsername = async () => {
    setSubmitting(true);

    try {
      await updateUsername(username);
      await refreshUserProfile();
    } catch (error) {
      showError('닉네임 변경 실패', getApiErrorMessage(error, '닉네임을 변경하지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword) {
      showError('비밀번호 변경 실패', '현재 비밀번호를 입력해 주세요.');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      showError('비밀번호 변경 실패', passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('비밀번호 변경 실패', '새 비밀번호 확인 값이 일치하지 않아요.');
      return;
    }

    setSubmitting(true);

    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      showError('비밀번호 변경 실패', getApiErrorMessage(error, '비밀번호를 변경하지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);

    try {
      await logout();
    } catch {
      // 로컬 세션 정리는 계속 진행합니다.
    } finally {
      enterAnonymousMode();
      replace('/');
      setSubmitting(false);
    }
  };

  const handleExit = async () => {
    setSubmitting(true);

    try {
      await exitAccount();
      enterAnonymousMode();
      replace('/');
    } catch (error) {
      showError('회원 탈퇴 요청 실패', getApiErrorMessage(error, '회원 탈퇴 요청을 처리하지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  // 탈퇴는 되돌리기 어려운 비활성화 작업이므로, 30일 복구 안내와 함께
  // 확인 단계를 거친 뒤에만 실제 요청을 보낸다(웹 마이페이지와 동일 안내).
  const confirmExit = () => {
    if (submitting) {
      return;
    }

    Alert.alert(
      '정말 탈퇴하시겠어요?',
      '탈퇴 신청일부터 30일 내로 다시 로그인하면 계정을 복구할 수 있어요.',
      [
        { style: 'cancel', text: '취소' },
        { onPress: () => void handleExit(), style: 'destructive', text: '탈퇴하기' },
      ],
    );
  };

  const avatarInitial = user.username?.trim().charAt(0) || '하';

  return (
    <AppScrollView>
      <View style={styles.myTopBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateEyebrow}>MY</Text>
          <Text style={styles.greetingTitle}>내 계정</Text>
        </View>
        <Pressable
          accessibilityLabel="계정 정보 새로고침"
          accessibilityRole="button"
          onPress={() => void refreshUserProfile().catch((error) =>
            showError('계정 정보 새로고침 실패', getApiErrorMessage(error, '계정 정보를 불러오지 못했어요.')),
          )}
          style={styles.topIconButton}>
          <Ionicons color={colors.text} name="refresh-outline" size={18} />
        </Pressable>
      </View>

      <View style={styles.profileRow}>
        <View style={styles.profileAvatar}>
          {user.profileUrl ? (
            <Image source={{ uri: user.profileUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.profileAvatarInitial}>{avatarInitial}</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.profileName}>{user.username}</Text>
          <Text style={styles.linkBody}>{user.email}</Text>
        </View>
        <Pressable
          accessibilityLabel={submitting ? '업로드 중' : '프로필 이미지 변경'}
          accessibilityRole="button"
          disabled={submitting}
          onPress={handlePickProfile}
          style={styles.editPill}>
          <Text style={styles.editPillText}>{submitting ? '업로드 중' : '편집'}</Text>
        </Pressable>
      </View>

      <View style={styles.statStripRow}>
        <View style={styles.statStripCell}>
          <Text style={styles.statStripNumber}>{savedCount}</Text>
          <Text style={styles.statStripLabel}>총 네 컷</Text>
        </View>
        <View style={[styles.statStripCell, styles.statStripDivider]}>
          <Text style={styles.statStripNumber}>{thisMonthCount}</Text>
          <Text style={styles.statStripLabel}>이번 달</Text>
        </View>
        <View style={[styles.statStripCell, styles.statStripDivider]}>
          <Text style={styles.statStripNumber}>{savedFrameCount}</Text>
          <Text style={styles.statStripLabel}>보관 프레임</Text>
        </View>
      </View>

      <View style={styles.menuCard}>
        {(
          [
            {
              icon: 'person-outline',
              id: 'account',
              sub: '이메일, 닉네임, 비밀번호 변경',
              title: '계정 정보',
            },
            {
              icon: 'sparkles-outline',
              id: 'plan',
              sub: `${user.planTier}${user.monthlyPrice ? ` · 월 ${user.monthlyPrice.toLocaleString('ko-KR')}원` : ''}`,
              title: '요금제',
            },
            {
              icon: 'notifications-outline',
              id: 'notif',
              sub: '푸시, 주간 리마인더',
              title: '알림 설정',
            },
            {
              icon: 'images-outline',
              id: 'frames',
              sub: `보관한 프레임 ${savedFrameCount}개`,
              title: '내 프레임',
            },
            {
              icon: 'settings-outline',
              id: 'pref',
              sub: '테마, 화질, 워터마크',
              title: '설정',
            },
          ] as {
            icon: ComponentProps<typeof Ionicons>['name'];
            id: MyMenuId;
            sub: string;
            title: string;
          }[]
        ).map((row, index) => {
          const open = openSection === row.id;

          return (
            <View
              key={row.id}
              style={index ? styles.menuRowDivider : undefined}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setOpenSection((prev) => (prev === row.id ? null : row.id))
                }
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed ? styles.menuRowPressed : null,
                ]}>
                <View style={styles.menuRowIcon}>
                  <Ionicons color={colors.primary} name={row.icon} size={19} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.menuRowTitle}>{row.title}</Text>
                  <Text style={styles.menuRowSub}>{row.sub}</Text>
                </View>
                <Ionicons
                  color={colors.muted}
                  name={open ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                />
              </Pressable>

              {open ? (
                <View style={styles.menuRowBody}>
                  {row.id === 'account' ? (
                    <View style={{ gap: 16 }}>
                      <View style={{ gap: 12 }}>
                        <Text style={styles.sectionTitle}>닉네임 변경</Text>
                        <Text style={styles.bodyCopy}>
                          서비스에서 표시될 이름을 수정할 수 있어요.
                        </Text>
                        <FormField
                          label="닉네임"
                          onChangeText={setUsername}
                          placeholder="닉네임을 입력해 주세요"
                          value={username}
                        />
                        <ActionButton
                          label={submitting ? '저장 중...' : '저장'}
                          onPress={() => void handleUpdateUsername()}
                        />
                      </View>
                      <View style={{ gap: 12 }}>
                        <Text style={styles.sectionTitle}>비밀번호 변경</Text>
                        <FormField
                          label="현재 비밀번호"
                          onChangeText={setOldPassword}
                          placeholder="현재 비밀번호를 입력해 주세요"
                          secure
                          value={oldPassword}
                        />
                        <FormField
                          label="새 비밀번호"
                          onChangeText={setNewPassword}
                          placeholder="새 비밀번호를 입력해 주세요"
                          secure
                          value={newPassword}
                        />
                        <FormField
                          label="새 비밀번호 확인"
                          onChangeText={setConfirmPassword}
                          placeholder="새 비밀번호를 한 번 더 입력해 주세요"
                          secure
                          value={confirmPassword}
                        />
                        <ActionButton
                          label={submitting ? '변경 중...' : '비밀번호 변경'}
                          onPress={() => void handleChangePassword()}
                        />
                      </View>
                    </View>
                  ) : null}

                  {row.id === 'plan' ? (
                    <View style={{ gap: 12 }}>
                      <View style={styles.quickGrid}>
                        <View style={styles.infoTile}>
                          <Text style={styles.linkBody}>로그인 플랫폼</Text>
                          <Text style={styles.linkTitle}>{user.loginPlatform}</Text>
                        </View>
                        <View style={styles.infoTile}>
                          <Text style={styles.linkBody}>플랜</Text>
                          <Text style={styles.linkTitle}>
                            {user.planTier}
                            {user.monthlyPrice
                              ? ` · 월 ${user.monthlyPrice.toLocaleString('ko-KR')}원`
                              : ''}
                          </Text>
                        </View>
                      </View>
                      <ActionButton
                        label="요금제 보기"
                        onPress={() => push('/pricing')}
                        variant="secondary"
                      />
                    </View>
                  ) : null}

                  {row.id === 'notif' ? (
                    <Text style={styles.bodyCopy}>
                      알림 설정은 곧 제공될 예정이에요. 주간 리마인더와 좋아요
                      알림을 이곳에서 관리할 수 있게 준비하고 있어요.
                    </Text>
                  ) : null}

                  {row.id === 'frames' ? (
                    <ActionButton
                      label="내 프레임 관리"
                      onPress={() => push('/theme')}
                      variant="secondary"
                    />
                  ) : null}

                  {row.id === 'pref' ? (
                    <View style={{ gap: 12 }}>
                      <Text style={styles.sectionTitle}>앱 테마</Text>
                      <View style={styles.themeOptionList}>
                        {THEME_OPTIONS.map((option) => {
                          const active = themePreference === option.value;

                          return (
                            <Pressable
                              key={option.value}
                              onPress={() => setThemePreference(option.value)}
                              style={({ pressed }) => [
                                styles.themeOption,
                                active ? styles.themeOptionActive : null,
                                pressed ? styles.themeOptionPressed : null,
                              ]}>
                              <View style={styles.themeOptionHeader}>
                                <View style={{ flex: 1, gap: 4 }}>
                                  <Text
                                    style={[
                                      styles.themeOptionLabel,
                                      active ? styles.themeOptionLabelActive : null,
                                    ]}>
                                    {option.label}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.themeOptionDescription,
                                      active
                                        ? styles.themeOptionDescriptionActive
                                        : null,
                                    ]}>
                                    {option.description}
                                  </Text>
                                </View>
                                <Ionicons
                                  color={active ? colors.primary : colors.muted}
                                  name={active ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={18}
                                />
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <ActionButton
        label={submitting ? '로그아웃 중...' : '로그아웃'}
        onPress={() => void handleLogout()}
        variant="secondary"
      />

      <Pressable
        accessibilityRole="button"
        onPress={confirmExit}
        style={styles.exitLinkButton}>
        <Text style={styles.exitLinkText}>회원 탈퇴</Text>
      </Pressable>

      <Text style={styles.appVersion}>하루컷 v1.0.0</Text>
    </AppScrollView>
  );
}

function createStyles(colors: HarucutThemeColors, isDark: boolean) {
  const tintedSurface = isDark ? 'rgba(30, 215, 96, 0.16)' : colors.cardMuted;
  const themeOptionActiveSurface = isDark ? 'rgba(30, 215, 96, 0.2)' : colors.primarySoft;

  return StyleSheet.create({
    avatarImage: {
      height: '100%',
      width: '100%',
    },
    bodyCopy: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    dateEyebrow: {
      color: colors.primaryStrong,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.4,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    editPill: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    editPillText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    greetingAccent: {
      color: colors.primaryStrong,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
      lineHeight: 31,
    },
    greetingTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
      lineHeight: 31,
    },
    heroCta: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 24,
      flexDirection: 'row',
      gap: 14,
      padding: 18,
      shadowColor: colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: isDark ? 0.34 : 0.24,
      shadowRadius: 30,
    },
    heroCtaIcon: {
      alignItems: 'center',
      backgroundColor: '#06140A',
      borderRadius: 15,
      height: 50,
      justifyContent: 'center',
      width: 50,
    },
    heroCtaSubtitle: {
      color: 'rgba(6, 20, 10, 0.72)',
      fontSize: 12.5,
      fontWeight: '500',
      marginTop: 2,
    },
    heroCtaTitle: {
      color: '#06140A',
      fontSize: 16,
      fontWeight: '800',
    },
    historyTopBar: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    homeTopBar: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    greetingBlock: {
      gap: 2,
      marginTop: 18,
    },
    myTopBar: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    pressedSoft: {
      opacity: 0.9,
    },
    profileName: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    quickCard: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: 10,
      minWidth: 0,
      padding: 14,
    },
    quickRow: {
      flexDirection: 'row',
      gap: 10,
    },
    quickSubtitle: {
      color: colors.muted,
      fontSize: 11,
    },
    quickTitle: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: '700',
    },
    recentTile: {
      gap: 8,
      width: '48%',
    },
    statCopy: {
      color: colors.textSoft,
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
    },
    statCopyAccent: {
      color: colors.primaryStrong,
      fontWeight: '700',
    },
    statCopyStrong: {
      color: colors.text,
      fontWeight: '700',
    },
    statNumber: {
      color: colors.primaryStrong,
      fontSize: 28,
      fontWeight: '800',
    },
    statStrip: {
      alignItems: 'center',
      backgroundColor: colors.primarySoft,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 14,
      padding: 16,
    },
    statStripCell: {
      alignItems: 'center',
      flex: 1,
      gap: 2,
    },
    statStripDivider: {
      borderLeftColor: colors.border,
      borderLeftWidth: 1,
    },
    statStripLabel: {
      color: colors.muted,
      fontSize: 11,
    },
    statStripNumber: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    statStripRow: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: 'row',
      paddingVertical: 16,
    },
    savedEmptyCard: {
      backgroundColor: tintedSurface,
      borderColor: colors.border,
      borderRadius: 18,
      borderStyle: 'dashed',
      borderWidth: 1,
      padding: 16,
    },
    thumbMeta: {
      color: colors.muted,
      fontSize: 11,
    },
    thumbTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    thumbTypeBadge: {
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      borderRadius: 999,
      flexDirection: 'row',
      gap: 4,
      left: 9,
      paddingHorizontal: 8,
      paddingVertical: 3,
      position: 'absolute',
      top: 9,
    },
    thumbTypeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    topIconButton: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 21,
      borderWidth: 1,
      height: 42,
      justifyContent: 'center',
      position: 'relative',
      width: 42,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    viewToggle: {
      backgroundColor: colors.cardStrong,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 3,
      padding: 3,
    },
    viewToggleButton: {
      alignItems: 'center',
      borderRadius: 999,
      height: 30,
      justifyContent: 'center',
      width: 32,
    },
    viewToggleButtonActive: {
      backgroundColor: '#FFFFFF',
    },
    monthHeader: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 8,
    },
    monthHeaderCount: {
      color: colors.muted,
      fontSize: 12,
    },
    monthHeaderTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    historyGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 14,
    },
    historyTile: {
      gap: 9,
      width: '47%',
      flexGrow: 1,
    },
    historyTileActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    historyTileButton: {
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: 38,
      paddingHorizontal: 8,
      paddingVertical: 9,
    },
    calendarNav: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    calendarNavButton: {
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      borderRadius: 17,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    calendarNavButtonDisabled: {
      opacity: 0.4,
    },
    calendarNavTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    calendarWeekRow: {
      flexDirection: 'row',
    },
    calendarWeekday: {
      color: colors.muted,
      flex: 1,
      fontSize: 10.5,
      fontWeight: '700',
      textAlign: 'center',
    },
    calendarWeekdaySat: {
      color: '#6BA6FF',
    },
    calendarWeekdaySun: {
      color: '#FF6B6B',
    },
    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    calendarCell: {
      aspectRatio: 0.75,
      borderColor: 'transparent',
      borderRadius: 9,
      borderWidth: 1,
      overflow: 'hidden',
      padding: 4,
      width: '12%',
      flexGrow: 1,
    },
    calendarCellFilled: {
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    calendarCellPreview: {
      flex: 1,
      justifyContent: 'center',
      marginTop: 2,
      position: 'relative',
    },
    calendarDay: {
      color: colors.muted,
      fontSize: 9.5,
      fontWeight: '700',
    },
    calendarDayActive: {
      color: colors.primaryStrong,
    },
    calendarBadge: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 4,
      position: 'absolute',
      right: -2,
      top: -2,
    },
    calendarBadgeText: {
      color: '#06140A',
      fontSize: 8,
      fontWeight: '800',
    },
    heroTitle: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
      lineHeight: 33.6,
    },
    heroTitleAccent: {
      color: colors.primaryStrong,
      fontSize: 28,
      fontWeight: '700',
      lineHeight: 33.6,
    },
    heroActionGroup: {
      gap: 10,
    },
    infoTile: {
      backgroundColor: tintedSurface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      gap: 4,
      padding: 12,
    },
    inlineLink: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    linkBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
    },
    linkTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    appVersion: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 6,
      textAlign: 'center',
    },
    exitLinkButton: {
      alignSelf: 'center',
      marginTop: 6,
      paddingVertical: 4,
    },
    exitLinkText: {
      color: colors.muted,
      fontSize: 12.5,
      textDecorationLine: 'underline',
    },
    menuCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      overflow: 'hidden',
    },
    menuRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 15,
    },
    menuRowBody: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 18,
    },
    menuRowDivider: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
    },
    menuRowIcon: {
      alignItems: 'center',
      backgroundColor: tintedSurface,
      borderRadius: 11,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    menuRowPressed: {
      opacity: 0.7,
    },
    menuRowSub: {
      color: colors.muted,
      fontSize: 12,
    },
    menuRowTitle: {
      color: colors.text,
      fontSize: 14.5,
      fontWeight: '700',
    },
    profileAvatar: {
      alignItems: 'center',
      backgroundColor: colors.primarySoft,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      height: 56,
      justifyContent: 'center',
      overflow: 'hidden',
      width: 56,
    },
    profileAvatarInitial: {
      color: colors.primaryStrong,
      fontSize: 22,
      fontWeight: '800',
    },
    profileRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    recentGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    recentEmptyCard: {
      backgroundColor: tintedSurface,
      borderColor: colors.border,
      borderRadius: 18,
      borderStyle: 'dashed',
      borderWidth: 1,
      gap: 6,
      padding: 16,
      width: '100%',
    },
    rowButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    savedContinueCard: {
      alignItems: 'center',
      backgroundColor: tintedSurface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 12,
    },
    frameUpgradeRow: {
      alignItems: 'center',
      backgroundColor: colors.primarySoft,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 14,
    },
    planNavRow: {
      alignItems: 'center',
      backgroundColor: tintedSurface,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 14,
    },
    planNavRowPressed: {
      opacity: 0.85,
    },
    sectionEyebrow: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    sectionHeader: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    statsWrap: {
      alignItems: 'flex-start',
      gap: 8,
    },
    themeOption: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    themeOptionActive: {
      backgroundColor: themeOptionActiveSurface,
      borderColor: colors.primary,
    },
    themeOptionDescription: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
    },
    themeOptionDescriptionActive: {
      color: colors.text,
    },
    themeOptionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    themeOptionLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    themeOptionLabelActive: {
      color: colors.primaryStrong,
    },
    themeOptionList: {
      gap: 10,
    },
    themeOptionPressed: {
      opacity: 0.92,
    },
    thumbCard: {
      aspectRatio: 0.75,
      backgroundColor: colors.primarySoft,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
    },
    thumbImage: {
      height: '100%',
      width: '100%',
    },
    thumbLoading: {
      opacity: 0.48,
    },
    thumbPlaceholder: {
      alignItems: 'center',
      flex: 1,
      gap: 6,
      justifyContent: 'center',
      padding: 10,
    },
    thumbPlaceholderText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}
