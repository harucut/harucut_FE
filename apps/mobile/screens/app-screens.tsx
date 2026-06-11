import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FramePreview } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, SurfaceCard } from '@/components/harucut/ui';
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

function formatCurrentDate() {
  return new Date().toLocaleDateString('ko-KR', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  });
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

  return (
    <AppScrollView>
      <PageHeader
        description={`${user.username}님, 촬영하거나 업로드해서 오늘의 기록을 바로 만들어 보세요.`}
        onPressRight={() => push('/mypage')}
        rightSlot={<Ionicons color={colors.text} name="person-outline" size={18} />}
        title="오늘 하루를 네 컷으로 남겨보세요"
      />

      <SurfaceCard style={{ gap: 16 }}>
        <Pill>{todayMoment}</Pill>
        <View style={{ gap: 10 }}>
          <Text style={styles.heroTitle}>찍고 저장하고,</Text>
          <Text style={styles.heroTitleAccent}>다시 꺼내 보는 하루컷</Text>
          <Text style={styles.bodyCopy}>촬영하거나 업로드해서 기록에 남겨두세요.</Text>
        </View>

        <View style={styles.heroActionGroup}>
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="camera-outline" size={16} />}
            label="바로 촬영 시작"
            onPress={() => push('/shoot')}
          />
          <View style={styles.rowButtons}>
            <ActionButton
              icon={<Ionicons color={colors.text} name="cloud-upload-outline" size={16} />}
              label="사진 업로드"
              onPress={() => push('/upload')}
              style={{ flex: 1 }}
              variant="secondary"
            />
            <ActionButton
              icon={<Ionicons color={colors.text} name="color-palette-outline" size={16} />}
              label="꾸미기"
              onPress={() => push('/theme')}
              style={{ flex: 1 }}
              variant="secondary"
            />
          </View>
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Recent</Text>
            <Text style={styles.sectionTitle}>최근 저장한 결과</Text>
          </View>
          <Text onPress={() => push('/history')} style={styles.inlineLink}>
            전체 보기
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
                <View key={item.id} style={styles.thumbCard}>
                  {previewUri && previewKind === 'image' ? (
                    <>
                      <Image source={{ uri: previewUri }} style={styles.thumbImage} />
                      {item.kind === 'video' ? (
                        <View style={styles.thumbVideoBadge}>
                          <Ionicons color="#FFFFFF" name="play" size={18} />
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons
                        color={colors.primary}
                        name={item.kind === 'video' ? 'play-circle-outline' : 'image-outline'}
                        size={24}
                      />
                      <Text style={styles.thumbPlaceholderText}>
                        {item.kind === 'video' ? '영상' : '미리보기 없음'}
                      </Text>
                    </View>
                  )}
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
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>이어 꾸밀 프레임</Text>
          <Text onPress={() => push('/theme')} style={styles.inlineLink}>
            전체 보기
          </Text>
        </View>
        {savedFrames[0] ? (
          <Pressable onPress={() => push('/theme/sticker')} style={styles.savedContinueCard}>
            <View style={{ width: 86 }}>
              <FramePreview
                accentColor={savedFrames[0].accentColor}
                backgroundColor={savedFrames[0].backgroundColor}
                caption={savedFrames[0].caption}
                frameId={savedFrames[0].frameId}
              />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.linkTitle}>{savedFrames[0].title}</Text>
              <Text style={styles.linkBody}>저장한 프레임을 이어서 수정할 수 있어요.</Text>
            </View>
            <Ionicons color={colors.muted} name="chevron-forward" size={16} />
          </Pressable>
        ) : (
          <Text style={styles.bodyCopy}>아직 저장한 프레임이 없어요.</Text>
        )}
      </SurfaceCard>
    </AppScrollView>
  );
}

export function HistoryScreen() {
  const { colors, styles } = useAppScreenTheme();
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const accessMode = useSessionStore((state) => state.accessMode);
  const historyError = useLibraryStore((state) => state.historyError);
  const historyItems = useLibraryStore((state) => state.historyItems);
  const historyStatus = useLibraryStore((state) => state.historyStatus);
  const loadRemoteHistory = useLibraryStore((state) => state.loadRemoteHistory);
  const renameHistoryItem = useLibraryStore((state) => state.renameHistoryItem);
  const showNotice = useSessionStore((state) => state.showNotice);
  const [filter, setFilter] = useState<'ALL' | 'PHOTO' | 'VIDEO'>('ALL');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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
    return historyItems.filter((item) => {
      const matchesType =
        filter === 'ALL' || (filter === 'PHOTO' ? item.kind === 'photo' : item.kind === 'video');
      const matchesSearch = item.title.toLowerCase().includes(search.trim().toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [filter, historyItems, search]);

  const photoCount = historyItems.filter((item) => item.kind === 'photo').length;
  const videoCount = historyItems.filter((item) => item.kind === 'video').length;
  const isHistoryLoading =
    historyStatus === 'loading' ||
    (accessMode === 'member' && historyStatus === 'idle');

  useEffect(() => {
    if (accessMode === 'member' && historyStatus === 'idle') {
      void loadRemoteHistory();
    }
  }, [accessMode, historyStatus, loadRemoteHistory]);

  return (
    <AppScrollView>
      <PageHeader
        backLabel="홈으로"
        description="내가 만든 사진과 영상을 다시 보고, 이름을 정리하고, 공유할 수 있어요."
        onPressBack={() => push('/home')}
        title="사진 기록"
      />

      <SurfaceCard style={{ gap: 16 }}>
        <View style={styles.sectionHeader}>
          <View style={{ gap: 10 }}>
            <Pill>MEMORY ARCHIVE</Pill>
            <Text style={styles.heroTitle}>다시 꺼내 보는 내 기록함</Text>
            <Text style={styles.bodyCopy}>
              저장한 결과를 다시 보고, 이름을 정리하고, 공유할 수 있어요.
            </Text>
          </View>
          <View style={styles.statsWrap}>
            <Pill>전체 {historyItems.length}개</Pill>
            <Pill>사진 {photoCount}개</Pill>
            <Pill>영상 {videoCount}개</Pill>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(['ALL', 'PHOTO', 'VIDEO'] as const).map((value) => (
            <Pill key={value} active={filter === value} onPress={() => setFilter(value)}>
              {value === 'ALL' ? '전체' : value === 'PHOTO' ? '사진' : '영상'}
            </Pill>
          ))}
        </View>

        <FormField label="검색" onChangeText={setSearch} placeholder="파일 이름으로 검색" value={search} />

        <View style={styles.rowButtons}>
          <ActionButton label="새 촬영" onPress={() => push('/shoot')} style={{ flex: 1 }} />
          <ActionButton label="업로드" onPress={() => push('/upload')} style={{ flex: 1 }} variant="secondary" />
        </View>
      </SurfaceCard>

      {isHistoryLoading ? (
        <SurfaceCard>
          <Text style={styles.bodyCopy}>저장한 기록을 불러오는 중이에요.</Text>
        </SurfaceCard>
      ) : historyStatus === 'error' ? (
        <SurfaceCard>
          <Text style={styles.bodyCopy}>{historyError ?? '저장한 기록을 불러오지 못했어요.'}</Text>
        </SurfaceCard>
      ) : filteredItems.length === 0 ? (
        <SurfaceCard>
          <Text style={styles.bodyCopy}>
            {historyItems.length === 0 ? '저장한 기록이 아직 없어요.' : '검색 결과가 없어요.'}
          </Text>
        </SurfaceCard>
      ) : (
        filteredItems.map((item) => (
          <SurfaceCard key={item.id} style={{ gap: 14 }}>
            <View style={styles.historyCardRow}>
              <View style={styles.historyPreview}>
                <FramePreview frameId={item.frameId} media={item.previewMedia} />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.sectionEyebrow}>{item.kind === 'photo' ? '사진' : '영상'}</Text>
                  {editingId === item.id ? (
                    <FormField label="파일 이름" onChangeText={setDraftName} value={draftName} />
                  ) : (
                    <Text style={styles.linkTitle}>{item.title}</Text>
                  )}
                  <Text style={styles.linkBody}>{formatDate(item.createdAt)}</Text>
                </View>

                <View style={styles.actionWrap}>
                  <ActionButton
                    icon={<Ionicons color="#FFFFFF" name="download-outline" size={15} />}
                    label={busyId === item.id ? '다운로드 중...' : '다운로드'}
                    onPress={() => void handleDownloadItem(item)}
                    style={{ flex: 1, minHeight: 42 }}
                  />
                  <ActionButton
                    icon={<Ionicons color={colors.text} name="share-social-outline" size={15} />}
                    label="공유하기"
                    onPress={() => void handleShareItem(item)}
                    style={{ flex: 1, minHeight: 42 }}
                    variant="secondary"
                  />
                  <ActionButton
                    icon={<Ionicons color={colors.text} name="create-outline" size={15} />}
                    label={editingId === item.id ? '저장' : '이름 수정'}
                    onPress={() => {
                      if (editingId === item.id) {
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
                    style={{ minHeight: 42, width: '100%' }}
                    variant="ghost"
                  />
                </View>
              </View>
            </View>
          </SurfaceCard>
        ))
      )}
    </AppScrollView>
  );
}

export function MyPageScreen() {
  const { colors, isDark, styles } = useAppScreenTheme();
  const router = useRouter();
  const replace = (path: string) => router.replace(path as never);
  const user = useSessionStore((state) => state.user);
  const refreshUserProfile = useSessionStore((state) => state.refreshUserProfile);
  const setUserProfile = useSessionStore((state) => state.setUserProfile);
  const enterAnonymousMode = useSessionStore((state) => state.enterAnonymousMode);
  const showNotice = useSessionStore((state) => state.showNotice);
  const themePreference = useSessionStore((state) => state.themePreference);
  const setThemePreference = useSessionStore((state) => state.setThemePreference);
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

  return (
    <AppScrollView>
      <PageHeader
        onPressRight={() => void refreshUserProfile().catch((error) =>
          showError('계정 정보 새로고침 실패', getApiErrorMessage(error, '계정 정보를 불러오지 못했어요.')),
        )}
        rightSlot={<Ionicons color={colors.text} name="refresh-outline" size={18} />}
        title="내 계정"
      />

      <SurfaceCard style={{ gap: 14 }}>
        <View style={styles.profileRow}>
          <View style={styles.profileAvatar}>
            {user.profileUrl ? <Image source={{ uri: user.profileUrl }} style={styles.avatarImage} /> : null}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.linkTitle}>{user.username}</Text>
            <Text style={styles.linkBody}>{user.email}</Text>
          </View>
        </View>

        <View style={styles.quickGrid}>
          <View style={styles.infoTile}>
            <Text style={styles.linkBody}>로그인 플랫폼</Text>
            <Text style={styles.linkTitle}>{user.loginPlatform}</Text>
          </View>
          <View style={styles.infoTile}>
            <Text style={styles.linkBody}>플랜</Text>
            <Text style={styles.linkTitle}>
              {user.planTier}
              {user.monthlyPrice ? ` · 월 ${user.monthlyPrice.toLocaleString('ko-KR')}원` : ''}
            </Text>
          </View>
        </View>

        <ActionButton
          label={submitting ? '업로드 중' : '업로드'}
          onPress={handlePickProfile}
          variant="secondary"
        />
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>닉네임 변경</Text>
        <Text style={styles.bodyCopy}>서비스에서 표시될 이름을 수정할 수 있어요.</Text>
        <FormField label="닉네임" onChangeText={setUsername} placeholder="닉네임을 입력해 주세요" value={username} />
        <ActionButton label={submitting ? '저장 중...' : '저장'} onPress={() => void handleUpdateUsername()} />
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
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
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
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
                    <Text style={[styles.themeOptionLabel, active ? styles.themeOptionLabelActive : null]}>
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.themeOptionDescription,
                        active ? styles.themeOptionDescriptionActive : null,
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
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>로그아웃</Text>
        <ActionButton
          label={submitting ? '로그아웃 중...' : '로그아웃'}
          onPress={() => void handleLogout()}
          variant="secondary"
        />
      </SurfaceCard>

      <SurfaceCard style={[styles.exitCard, { gap: 12 }]}>
        <Text style={styles.exitTitle}>회원 탈퇴 요청</Text>
        <Text style={styles.exitBody}>
          탈퇴를 요청하면 계정이 비활성화돼요. 다시 로그인하면 탈퇴를 취소하고 계정을 다시 사용할 수 있어요.
        </Text>
        <ActionButton
          label="회원 탈퇴 요청"
          onPress={() => void handleExit()}
          variant="danger"
        />
      </SurfaceCard>
    </AppScrollView>
  );
}

function createStyles(colors: HarucutThemeColors, isDark: boolean) {
  const tintedSurface = isDark ? 'rgba(37, 99, 235, 0.16)' : colors.cardMuted;
  const themeOptionActiveSurface = isDark ? 'rgba(37, 99, 235, 0.2)' : colors.primarySoft;

  return StyleSheet.create({
    actionWrap: {
      gap: 8,
    },
    avatarImage: {
      height: '100%',
      width: '100%',
    },
    bodyCopy: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    exitCard: {
      backgroundColor: colors.dangerSoft,
    },
    exitTitle: {
      color: colors.danger,
      fontSize: 18,
      fontWeight: '700',
    },
    exitBody: {
      color: isDark ? '#FECACA' : '#7F1D1D',
      fontSize: 12,
      lineHeight: 18,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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
    historyCardRow: {
      flexDirection: 'row',
      gap: 12,
    },
    historyPreview: {
      width: 104,
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
    profileAvatar: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      height: 56,
      overflow: 'hidden',
      width: 56,
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
      width: '48%',
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
    thumbVideoBadge: {
      alignItems: 'center',
      backgroundColor: colors.overlayStrong,
      borderColor: 'rgba(255, 255, 255, 0.32)',
      borderRadius: 22,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      left: '50%',
      marginLeft: -22,
      marginTop: -22,
      position: 'absolute',
      top: '50%',
      width: 44,
    },
  });
}
