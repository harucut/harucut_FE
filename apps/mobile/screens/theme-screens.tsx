import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FrameCapacityMeter, FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, StepProgress, SurfaceCard } from '@/components/harucut/ui';
import { BACKGROUND_SWATCHES, FRAME_COLOR_SWATCHES, THEME_STICKERS, THEME_TEXT_COLOR_SWATCHES, type ThemeAsset, type ThemeEditorComponent } from '@/constants/harucut-data';
import { resolvePlanInfo } from '@/constants/plan-limits';
import type { HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiErrorMessage } from '@/lib/api-client';
import { getSubscriptionUsage, type SubscriptionUsage } from '@/lib/user-api';
import { getPresignedImageUrl, resolveUploadContentType, uploadLocalFileWithPresigned } from '@/lib/file-storage-api';
import { useLibraryStore } from '@/store/use-library-store';
import { useSessionStore } from '@/store/use-session-store';
import { useThemeEditorStore, type ThemeDecorateTab } from '@/store/use-theme-editor-store';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const DECORATE_TABS: [ThemeDecorateTab, string][] = [
  ['photo', '사진'],
  ['frame', '프레임색'],
  ['text', '텍스트'],
  ['sticker', '스티커'],
  ['cut', '누끼'],
  ['layer', '선택'],
];

function useThemeScreenStyles() {
  const { colors } = useHarucutTheme();

  return useMemo(() => createStyles(colors), [colors]);
}

export function ThemeFrameScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const accessMode = useSessionStore((state) => state.accessMode);
  const savedFrames = useLibraryStore((state) => state.savedFrames);
  const planTier = useSessionStore((state) => state.user.planTier);
  const refreshUserProfile = useSessionStore((state) => state.refreshUserProfile);
  const themeEditor = useThemeEditorStore();
  const loadRemoteFrames = useLibraryStore((state) => state.loadRemoteFrames);
  const setThemeFrame = useThemeEditorStore((state) => state.setThemeFrame);
  const selectSavedFrameForTheme = useThemeEditorStore((state) => state.selectSavedFrameForTheme);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const basePlan = resolvePlanInfo(planTier);
  // 프레임 보관 한도는 서버 구독 사용량을 우선 사용한다. 무제한(frameRetentionUnlimited 또는 -1)이면
  // 한도를 Infinity로 둬 한도 게이트/요금제 유도를 막고, 유한 한도면 그 값을, 미조회 시 tier 기본값을 쓴다.
  const unlimitedRetention =
    usage != null &&
    (usage.frameRetentionUnlimited || usage.frameRetentionLimit < 0);
  const serverFrameLimit =
    usage && !usage.frameRetentionUnlimited && usage.frameRetentionLimit > 0
      ? usage.frameRetentionLimit
      : null;
  const plan = unlimitedRetention
    ? { ...basePlan, limit: Number.POSITIVE_INFINITY, next: null, nextLimit: null }
    : serverFrameLimit != null
      ? { ...basePlan, limit: serverFrameLimit }
      : basePlan;
  // 보관함이 요금제 한도에 도달하면 새 프레임 생성 진입을 막는다(서버 한도 우회 방지).
  const isAtCapacity = savedFrames.length >= plan.limit;
  // 원격 프레임 로딩 전에는 savedFrames가 빈 배열이라 한도를 알 수 없으므로,
  // 로딩이 끝나기 전까지 생성 진입을 보류한다(비회원은 원격 로딩 불필요).
  const [framesLoaded, setFramesLoaded] = useState(false);

  useEffect(() => {
    if (accessMode === 'member') {
      void loadRemoteFrames().finally(() => setFramesLoaded(true));
      void refreshUserProfile().catch(() => {});
      void getSubscriptionUsage()
        .then(setUsage)
        .catch(() => {});
    } else {
      setFramesLoaded(true);
    }
  }, [accessMode, loadRemoteFrames, refreshUserProfile]);

  const handleConfirmNewFrame = () => {
    if (!framesLoaded) return;
    push(isAtCapacity ? '/mypage' : '/theme/sticker');
  };

  return (
    <AppScrollView>
      <PageHeader backLabel="처음으로" onPressBack={() => push('/home')} />
      <StepProgress current={1} label="프레임 선택" total={2} />
      <FrameCapacityMeter onUpgrade={() => push('/mypage')} plan={plan} used={savedFrames.length} />
      <FramePickerSection
        confirmLabel={
          !framesLoaded
            ? '불러오는 중...'
            : isAtCapacity
              ? '보관함이 가득 찼어요 · 업그레이드'
              : '새 프레임 만들기'
        }
        onConfirm={handleConfirmNewFrame}
        onSelect={setThemeFrame}
        selectedFrameId={themeEditor.frameId}
      />
      <SavedFramesPanel
        actionLabel="수정하기"
        emptyText="저장한 프레임이 없어요."
        frames={savedFrames}
        onAction={() => push('/theme/sticker')}
        onRefresh={() => void loadRemoteFrames()}
        onSelect={selectSavedFrameForTheme}
        onUpgrade={() => push('/mypage')}
        planLimit={plan.limit}
        selectedFrameId={themeEditor.frameId}
        selectedSavedFrameId={themeEditor.selectedSavedFrameId}
        title="저장한 프레임"
      />
    </AppScrollView>
  );
}

export function ThemeStickerScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const styles = useThemeScreenStyles();
  const { colors: themeColors } = useHarucutTheme();
  const themeEditor = useThemeEditorStore();
  const setThemeTitle = useThemeEditorStore((state) => state.setThemeTitle);
  const setThemeDescription = useThemeEditorStore((state) => state.setThemeDescription);
  const setThemeBackgroundColor = useThemeEditorStore((state) => state.setThemeBackgroundColor);
  const setThemeBackgroundImage = useThemeEditorStore((state) => state.setThemeBackgroundImage);
  const setThemeBackgroundPreview = useThemeEditorStore((state) => state.setThemeBackgroundPreview);
  const clearThemeBackgroundImage = useThemeEditorStore((state) => state.clearThemeBackgroundImage);
  const setThemeActiveComponent = useThemeEditorStore((state) => state.setThemeActiveComponent);
  const setThemeTab = useThemeEditorStore((state) => state.setThemeTab);
  const addThemePhotoAssets = useThemeEditorStore((state) => state.addThemePhotoAssets);
  const addThemeComponentFromAsset = useThemeEditorStore((state) => state.addThemeComponentFromAsset);
  const addThemeText = useThemeEditorStore((state) => state.addThemeText);
  const duplicateThemeComponent = useThemeEditorStore((state) => state.duplicateThemeComponent);
  const moveThemeComponentDown = useThemeEditorStore((state) => state.moveThemeComponentDown);
  const moveThemeComponentUp = useThemeEditorStore((state) => state.moveThemeComponentUp);
  const removeThemeComponent = useThemeEditorStore((state) => state.removeThemeComponent);
  const removeThemePhotoAsset = useThemeEditorStore((state) => state.removeThemePhotoAsset);
  const transformThemeComponent = useThemeEditorStore((state) => state.transformThemeComponent);
  const toggleThemeComponentHidden = useThemeEditorStore((state) => state.toggleThemeComponentHidden);
  const toggleThemeComponentLocked = useThemeEditorStore((state) => state.toggleThemeComponentLocked);
  const saveThemeFrame = useThemeEditorStore((state) => state.saveThemeFrame);
  const removeSavedFrame = useThemeEditorStore((state) => state.removeSavedFrame);
  const showNotice = useSessionStore((state) => state.showNotice);
  const toggleThemeCellCutout = useThemeEditorStore((state) => state.toggleThemeCellCutout);
  const updateThemeComponent = useThemeEditorStore((state) => state.updateThemeComponent);
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [textDraft, setTextDraft] = useState('하루컷');
  const [decorateTab, setDecorateTab] = useState<ThemeDecorateTab>('photo');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogError, setSaveDialogError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(themeEditor.title);
  const [draftDescription, setDraftDescription] = useState(themeEditor.description);
  const previewRef = useRef<View | null>(null);
  const activeComponent = useMemo(
    () => themeEditor.components.find((component) => component.id === themeEditor.activeComponentId) ?? null,
    [themeEditor.activeComponentId, themeEditor.components],
  );

  useEffect(() => {
    if (!themeEditor.frameId) {
      router.replace('/theme' as never);
    }
  }, [router, themeEditor.frameId]);

  // 저장된 IMAGE 배경 프레임을 다시 열면 key를 URL로 해석해 미리보기에 복원한다.
  // (수정 저장 시 배경 이미지가 빠진 단색 썸네일로 저장되는 문제 방지)
  useEffect(() => {
    const background = themeEditor.background;
    if (background.type !== 'IMAGE' || !background.key || themeEditor.backgroundImageUri) {
      return;
    }

    let cancelled = false;
    void getPresignedImageUrl(background.key)
      .then((url) => {
        if (!cancelled && url) {
          setThemeBackgroundPreview(url);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [themeEditor.background, themeEditor.backgroundImageUri, setThemeBackgroundPreview]);

  const showError = (title: string, error: unknown, fallback: string) => {
    showNotice({
      actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
      eyebrow: 'FRAME ERROR',
      icon: 'warning-outline',
      message: getApiErrorMessage(error, fallback),
      title,
    });
  };

  const openSaveDialog = () => {
    if (saving) {
      return;
    }

    setDraftTitle(themeEditor.title);
    setDraftDescription(themeEditor.description);
    setSaveDialogError(null);
    setThemeActiveComponent(null);
    setSaveDialogOpen(true);
  };

  const handlePickPhotos = async () => {
    if (uploadingPhotos) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.9,
      selectionLimit: 8,
    });

    if (result.canceled) {
      return;
    }

    setUploadingPhotos(true);

    let failed = 0;
    const uploadedAssets: ThemeAsset[] = [];

    for (const asset of result.assets) {
      try {
        const filename = asset.fileName ?? `theme-photo-${Date.now()}.jpg`;
        const uploaded = await uploadLocalFileWithPresigned({
          contentType: resolveUploadContentType({
            filename,
            mimeType: asset.mimeType,
            uri: asset.uri,
          }),
          filename,
          isTemp: true,
          type: 'FRAME_COMPONENT',
          uri: asset.uri,
        });

        uploadedAssets.push({
          id: `theme-photo-${Date.now()}-${uploadedAssets.length}`,
          label: filename,
          mimeType: asset.mimeType,
          s3Key: uploaded.key,
          uri: uploaded.objectUrl,
        });
      } catch {
        failed += 1;
      }
    }

    if (uploadedAssets.length > 0) {
      addThemePhotoAssets(uploadedAssets);
    }

    if (failed > 0) {
      showNotice({
        actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
        eyebrow: 'UPLOAD',
        icon: 'warning-outline',
        message: `${failed}개의 사진을 업로드하지 못했어요.`,
        title: '사진 업로드 실패',
      });
    }

    setUploadingPhotos(false);
  };

  const handlePickBackground = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ['images'],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    setThemeBackgroundImage(result.assets[0].uri);
  };

  const handleSaveFrame = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaveDialogError(null);

    try {
      if (!previewRef.current) {
        throw new Error('저장할 프레임 미리보기를 찾지 못했어요.');
      }

      const uri = await captureRef(previewRef.current, {
        format: 'jpg',
        quality: 0.96,
      });
      setThemeTitle(draftTitle);
      setThemeDescription(draftDescription);
      await saveThemeFrame(uri);
      setSaveDialogOpen(false);
      push('/theme');
    } catch (error) {
      const message = getApiErrorMessage(error, '프레임을 서버에 저장하지 못했어요.');
      setSaveDialogError(message);
      showError('프레임 저장 실패', error, message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFrame = async () => {
    if (!themeEditor.selectedSavedFrameId) {
      return;
    }

    setSaving(true);

    try {
      await removeSavedFrame(themeEditor.selectedSavedFrameId);
      push('/theme');
    } catch (error) {
      showError('프레임 삭제 실패', error, '프레임을 삭제하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScrollView>
      <PageHeader
        backLabel="프레임 목록으로"
        onPressBack={() => push('/theme')}
      />

      <SurfaceCard style={{ gap: 14 }}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>꾸미기</Text>
          <Pressable accessibilityRole="button" onPress={openSaveDialog}>
            <Text style={styles.doneText}>{saving ? '저장 중...' : '완료'}</Text>
          </Pressable>
        </View>
        <View collapsable={false} ref={previewRef} style={styles.previewWrap}>
          <FramePreview
            activeComponentId={themeEditor.activeComponentId}
            backgroundColor={themeEditor.backgroundColor}
            backgroundImageUri={themeEditor.backgroundImageUri ?? undefined}
            cellCutouts={themeEditor.cellCutouts}
            components={themeEditor.components}
            cutMode={decorateTab === 'cut'}
            editorMode
            frameId={themeEditor.frameId}
            onCellTap={toggleThemeCellCutout}
            onSelectComponent={setThemeActiveComponent}
            onTransformComponent={transformThemeComponent}
          />
        </View>
      </SurfaceCard>

      {/* 하단 시트 6탭: 사진 · 프레임색 · 텍스트 · 스티커 · 누끼 · 선택 (핸드오프 app-decorate) */}
      <SurfaceCard style={{ gap: 14 }}>
        <ScrollView
          contentContainerStyle={styles.decorateTabRow}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {DECORATE_TABS.map(([id, label]) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: decorateTab === id }}
              key={id}
              onPress={() => {
                setDecorateTab(id);
                if (id === 'photo') setThemeTab('PHOTO');
                if (id === 'sticker') setThemeTab('STICKER');
                if (id === 'text') setThemeTab('TEXT');
              }}
              style={[styles.decorateTab, decorateTab === id ? styles.decorateTabActive : null]}>
              <Text style={[styles.decorateTabText, decorateTab === id ? styles.decorateTabTextActive : null]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {decorateTab === 'photo' ? (
          <View style={{ gap: 12 }}>
            <Text style={styles.bodyText}>프레임에 넣을 사진을 올려요 · 최대 8장</Text>
            <ActionButton
              icon={<Ionicons color="#FFFFFF" name="images-outline" size={16} />}
              label={uploadingPhotos ? '업로드 중...' : '사진 추가'}
              onPress={() => void handlePickPhotos()}
            />
            {themeEditor.assets.photos.length === 0 ? (
              <Text style={styles.bodyText}>아직 추가한 사진이 없어요.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.assetStrip}>
                  {themeEditor.assets.photos.map((photo) => (
                    <View key={photo.id} style={styles.assetTile}>
                      <Pressable
                        accessibilityLabel={`${photo.label} 추가`}
                        accessibilityRole="button"
                        onPress={() => addThemeComponentFromAsset('PHOTO', photo.uri)}
                        style={styles.assetPressable}>
                        <Image source={{ uri: photo.uri }} style={styles.assetImage} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel="사진 삭제"
                        accessibilityRole="button"
                        onPress={() => {
                          const result = removeThemePhotoAsset(photo.id);
                          if (!result.ok) {
                            showNotice({
                              actions: [{ id: 'dismiss', label: '닫기', variant: 'secondary' }],
                              eyebrow: 'PHOTO',
                              icon: 'warning-outline',
                              message:
                                result.reason === 'IN_USE'
                                  ? '프레임에서 사용 중인 사진은 먼저 레이어에서 삭제해 주세요.'
                                  : '사진을 찾지 못했어요.',
                              title: '사진 삭제 불가',
                            });
                          }
                        }}
                        style={styles.assetRemoveButton}>
                        <Ionicons color="#FFFFFF" name="close" size={12} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
            <Text style={styles.bodyText}>올린 사진을 눌러 프레임 위에 올린 뒤 드래그로 배치해요.</Text>
          </View>
        ) : null}

        {decorateTab === 'frame' ? (
          <View style={{ gap: 14 }}>
            <Text style={styles.panelLabel}>프레임(스트립) 색</Text>
            <View style={styles.swatchRow}>
              {FRAME_COLOR_SWATCHES.map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  onPress={() => setThemeBackgroundColor(color)}
                  selected={!themeEditor.backgroundImageUri && themeEditor.backgroundColor.toUpperCase() === color.toUpperCase()}
                  styles={styles}
                />
              ))}
            </View>
            <Text style={styles.panelLabel}>추천 배경색</Text>
            <View style={styles.swatchRow}>
              {BACKGROUND_SWATCHES.map((color) => (
                <ColorSwatch
                  key={color.value}
                  color={color.value}
                  onPress={() => setThemeBackgroundColor(color.value)}
                  selected={!themeEditor.backgroundImageUri && themeEditor.backgroundColor.toUpperCase() === color.value.toUpperCase()}
                  styles={styles}
                />
              ))}
            </View>
            <View style={styles.filterWrap}>
              <ActionButton
                icon={<Ionicons color="#FFFFFF" name="image-outline" size={16} />}
                label={themeEditor.backgroundImageUri ? '배경 이미지 변경' : '배경 이미지'}
                onPress={() => void handlePickBackground()}
                style={{ flex: 1 }}
              />
              {themeEditor.backgroundImageUri ? (
                <ActionButton
                  label="이미지 제거"
                  onPress={clearThemeBackgroundImage}
                  style={{ flex: 1 }}
                  variant="secondary"
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {decorateTab === 'text' ? (
          <View style={{ gap: 12 }}>
            <FormField
              label="텍스트"
              onChangeText={setTextDraft}
              placeholder="하루컷"
              value={textDraft}
            />
            <ActionButton label="＋ 텍스트 추가" onPress={() => { addThemeText(textDraft); setDecorateTab('layer'); }} />
            <Text style={styles.bodyText}>추가한 뒤 ‘선택’ 탭에서 회전·크기·색을 바꿔요.</Text>
          </View>
        ) : null}

        {decorateTab === 'sticker' ? (
          <View style={styles.stickerGrid}>
            {THEME_STICKERS.map((sticker) => (
              <Pressable
                key={sticker.id}
                accessibilityLabel={`${sticker.label} 스티커 추가`}
                accessibilityRole="button"
                onPress={() => addThemeComponentFromAsset('STICKER', sticker.symbol)}
                style={styles.stickerTile}>
                <Text style={styles.stickerTileSymbol}>{sticker.symbol}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {decorateTab === 'cut' ? (
          <View style={{ gap: 12 }}>
            <Text style={styles.panelLabel}>누끼 따기 (배경 제거)</Text>
            <Text style={styles.bodyText}>
              위 미리보기에서 칸을 누르면 인물만 남기고 배경을 지워요. 다시 누르면 원래대로 돌아와요.
            </Text>
            <View style={styles.cutGrid}>
              {[0, 1, 2, 3].map((index) => {
                const on = themeEditor.cellCutouts[index];
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    key={index}
                    onPress={() => toggleThemeCellCutout(index)}
                    style={[styles.cutChip, on ? styles.cutChipActive : null]}>
                    <Text style={[styles.cutChipText, on ? styles.cutChipTextActive : null]}>
                      {index + 1}번 칸 {on ? '적용됨' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {decorateTab === 'layer' ? (
          <View style={{ gap: 12 }}>
            {activeComponent ? (
              <ThemeSelectionInspector
                colors={themeColors}
                component={activeComponent}
                onChange={(patch) => updateThemeComponent(activeComponent.id, patch)}
                onDelete={() => removeThemeComponent(activeComponent.id)}
                styles={styles}
              />
            ) : (
              <Text style={styles.bodyText}>미리보기에서 텍스트·스티커·사진을 눌러 선택하세요.</Text>
            )}

            <View style={styles.cardHeaderRow}>
              <Text style={styles.panelLabel}>레이어</Text>
              <Text style={styles.bodyText}>{themeEditor.components.length}개</Text>
            </View>
            {themeEditor.components.length === 0 ? (
              <Text style={styles.bodyText}>추가한 레이어가 없어요.</Text>
            ) : (
              <View style={styles.layerList}>
                {themeEditor.components.map((component, index) => (
                  <ThemeLayerRow
                    key={component.id}
                    active={component.id === themeEditor.activeComponentId}
                    component={component}
                    isFirst={index === 0}
                    isLast={index === themeEditor.components.length - 1}
                    onDelete={() => removeThemeComponent(component.id)}
                    onDuplicate={() => duplicateThemeComponent(component.id)}
                    onMoveDown={() => moveThemeComponentDown(component.id)}
                    onMoveUp={() => moveThemeComponentUp(component.id)}
                    onSelect={() => setThemeActiveComponent(component.id)}
                    onToggleHidden={() => toggleThemeComponentHidden(component.id)}
                    onToggleLocked={() => toggleThemeComponentLocked(component.id)}
                    styles={styles}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>프레임 저장</Text>
        <ActionButton
          icon={<Ionicons color="#FFFFFF" name="save-outline" size={16} />}
          label={saving ? '저장 중...' : themeEditor.selectedSavedFrameId ? '수정 저장' : '저장'}
          onPress={openSaveDialog}
        />
        {themeEditor.selectedSavedFrameId ? (
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="trash-outline" size={16} />}
            label="삭제"
            onPress={() => void handleRemoveFrame()}
            variant="danger"
          />
        ) : null}
      </SurfaceCard>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!saving) {
            setSaveDialogOpen(false);
          }
        }}
        transparent
        visible={saveDialogOpen}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {themeEditor.selectedSavedFrameId ? '저장한 프레임 수정' : '프레임 저장'}
            </Text>
            <Text style={styles.bodyText}>저장할 프레임 이름과 설명을 입력해 주세요.</Text>
            <FormField
              editable={!saving}
              label="프레임 이름"
              maxLength={40}
              onChangeText={setDraftTitle}
              placeholder="프레임 이름을 입력해 주세요"
              value={draftTitle}
            />
            <FormField
              editable={!saving}
              label="프레임 설명"
              maxLength={160}
              multiline
              onChangeText={setDraftDescription}
              placeholder="프레임 설명을 입력해 주세요"
              style={{ minHeight: 88, paddingTop: 14 }}
              value={draftDescription}
            />
            {saveDialogError ? <Text style={styles.modalError}>{saveDialogError}</Text> : null}
            <View style={styles.modalActions}>
              <ActionButton
                label="취소"
                onPress={() => {
                  if (!saving) {
                    setSaveDialogOpen(false);
                  }
                }}
                style={{ flex: 1 }}
                variant="secondary"
              />
              <ActionButton
                label={saving ? '저장 중...' : themeEditor.selectedSavedFrameId ? '수정 저장' : '저장'}
                onPress={() => void handleSaveFrame()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </AppScrollView>
  );
}

function ColorSwatch({
  color,
  onPress,
  selected,
  styles,
}: {
  color: string;
  onPress: () => void;
  selected: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityLabel={`${color} 색`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.swatch, { backgroundColor: color }, selected ? styles.swatchSelected : null]}
    />
  );
}

// 핸드오프 "선택" 탭: 회전·크기·(텍스트)색을 바꾸고 삭제한다.
function ThemeSelectionInspector({
  colors,
  component,
  onChange,
  onDelete,
  styles,
}: {
  colors: HarucutColors;
  component: ThemeEditorComponent;
  onChange: (patch: Partial<ThemeEditorComponent> & { styleJson?: ThemeEditorComponent['styleJson'] }) => void;
  onDelete: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const isText = component.type === 'TEXT';
  const rotation = Math.round(component.rotation ?? 0);
  const stepRotation = (delta: number) => onChange({ rotation: (component.rotation ?? 0) + delta });
  const stepSize = (factor: number) => {
    if (isText) {
      const current = component.styleJson?.fontSize ?? 128;
      const next = Math.min(420, Math.max(12, Math.round(current * factor)));
      onChange({ styleJson: { ...(component.styleJson ?? {}), fontSize: next } });
    } else {
      const next = Math.min(3, Math.max(0.2, (component.scale ?? 1) * factor));
      onChange({ scale: next });
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.panelLabel}>
          {isText ? `"${component.source}"` : component.type === 'PHOTO' ? '사진' : component.source} 편집
        </Text>
        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.deletePill}>
          <Ionicons color="#FFFFFF" name="trash-outline" size={13} />
          <Text style={styles.deletePillText}>삭제</Text>
        </Pressable>
      </View>

      <View style={styles.stepRow}>
        <Text style={styles.stepLabel}>회전</Text>
        <View style={styles.stepControls}>
          <StepButton label="-" onPress={() => stepRotation(-15)} styles={styles} />
          <Text style={styles.stepValue}>{rotation}°</Text>
          <StepButton label="+" onPress={() => stepRotation(15)} styles={styles} />
        </View>
      </View>

      <View style={styles.stepRow}>
        <Text style={styles.stepLabel}>크기</Text>
        <View style={styles.stepControls}>
          <StepButton label="-" onPress={() => stepSize(0.9)} styles={styles} />
          <Text style={styles.stepValue}>
            {isText ? `${Math.round(component.styleJson?.fontSize ?? 128)}` : `${Math.round((component.scale ?? 1) * 100)}%`}
          </Text>
          <StepButton label="+" onPress={() => stepSize(1.1)} styles={styles} />
        </View>
      </View>

      {isText ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.panelLabel}>글자 색</Text>
          <View style={styles.swatchRow}>
            {THEME_TEXT_COLOR_SWATCHES.map((color) => (
              <ColorSwatch
                key={color}
                color={color}
                onPress={() => onChange({ styleJson: { ...(component.styleJson ?? {}), color } })}
                selected={(component.styleJson?.color ?? '#FFFFFF').toUpperCase() === color.toUpperCase()}
                styles={styles}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StepButton({
  label,
  onPress,
  styles,
}: {
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.stepButton}>
      <Text style={styles.stepButtonText}>{label}</Text>
    </Pressable>
  );
}

function componentTitle(component: ThemeEditorComponent) {
  if (component.type === 'TEXT') {
    return component.source.trim() || '텍스트';
  }

  if (component.type === 'STICKER' && !/^(https?:|file:|content:|data:)/.test(component.source)) {
    return component.source;
  }

  return component.type === 'PHOTO' ? '사진' : '스티커';
}

function ThemeLayerRow({
  active,
  component,
  isFirst,
  isLast,
  onDelete,
  onDuplicate,
  onMoveDown,
  onMoveUp,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  styles,
}: {
  active: boolean;
  component: ThemeEditorComponent;
  isFirst: boolean;
  isLast: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onSelect: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.layerRow, active ? styles.layerRowActive : null, component.hidden ? styles.layerRowHidden : null]}>
      <Pressable accessibilityRole="button" onPress={onSelect} style={styles.layerMain}>
        <View style={styles.layerTypeBadge}>
          <Text style={styles.layerTypeText}>{component.type}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.layerItem}>{componentTitle(component)}</Text>
          <Text style={styles.layerMeta}>zIndex {component.zIndex}</Text>
        </View>
      </Pressable>
      <View style={styles.layerActions}>
        <IconAction active={component.locked} icon={component.locked ? 'lock-closed' : 'lock-open-outline'} onPress={onToggleLocked} styles={styles} />
        <IconAction active={component.hidden} icon={component.hidden ? 'eye-off-outline' : 'eye-outline'} onPress={onToggleHidden} styles={styles} />
        <IconAction disabled={isLast} icon="chevron-up" onPress={onMoveUp} styles={styles} />
        <IconAction disabled={isFirst} icon="chevron-down" onPress={onMoveDown} styles={styles} />
        <IconAction icon="copy-outline" onPress={onDuplicate} styles={styles} />
        <IconAction danger icon="trash-outline" onPress={onDelete} styles={styles} />
      </View>
    </View>
  );
}

function IconAction({
  active,
  danger,
  disabled,
  icon,
  onPress,
  styles,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: IoniconName;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const { colors } = useHarucutTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.iconAction,
        active ? styles.iconActionActive : null,
        danger ? styles.iconActionDanger : null,
        disabled ? styles.iconActionDisabled : null,
      ]}>
      <Ionicons color={danger || active ? '#FFFFFF' : colors.text} name={icon} size={14} />
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
    activeBadge: {
      color: colors.primaryStrong,
      fontSize: 11,
      fontWeight: '700',
    },
    assetImage: {
      height: '100%',
      width: '100%',
    },
    assetPressable: {
      flex: 1,
    },
    assetRemoveButton: {
      alignItems: 'center',
      backgroundColor: colors.overlayStrong,
      borderRadius: 999,
      height: 24,
      justifyContent: 'center',
      position: 'absolute',
      right: 6,
      top: 6,
      width: 24,
    },
    assetStrip: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 2,
    },
    assetTile: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      height: 92,
      overflow: 'hidden',
      width: 92,
    },
    cardHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    doneText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '800',
    },
    decorateTabRow: {
      flexDirection: 'row',
      gap: 6,
      paddingRight: 8,
    },
    decorateTab: {
      backgroundColor: colors.cardStrong,
      borderRadius: 999,
      height: 36,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    decorateTabActive: {
      backgroundColor: '#FFFFFF',
    },
    decorateTabText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    decorateTabTextActive: {
      color: '#0B0B0C',
    },
    panelLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    swatchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    swatch: {
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 40,
      width: 40,
    },
    swatchSelected: {
      borderColor: colors.primary,
      borderWidth: 3,
    },
    cutGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    cutChip: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    cutChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    cutChipText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    cutChipTextActive: {
      color: colors.primaryStrong,
    },
    deletePill: {
      alignItems: 'center',
      backgroundColor: colors.danger,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    deletePillText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    stepRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    stepLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    stepControls: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
    },
    stepValue: {
      color: colors.muted,
      fontSize: 12,
      minWidth: 48,
      textAlign: 'center',
    },
    stepButton: {
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      height: 34,
      justifyContent: 'center',
      width: 40,
    },
    stepButtonText: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    filterWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    iconAction: {
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    iconActionActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    iconActionDanger: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
    },
    iconActionDisabled: {
      opacity: 0.36,
    },
    layerActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'flex-end',
    },
    layerItem: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 18,
    },
    layerList: {
      gap: 8,
    },
    layerMain: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 10,
      minWidth: 0,
    },
    layerMeta: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 2,
    },
    layerRow: {
      alignItems: 'center',
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 10,
    },
    layerRowActive: {
      borderColor: colors.primary,
    },
    layerRowHidden: {
      opacity: 0.55,
    },
    layerTypeBadge: {
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    layerTypeText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
    },
    modalCard: {
      backgroundColor: colors.cardStrong,
      borderColor: colors.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: 14,
      padding: 18,
      width: '100%',
    },
    modalError: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
    },
    modalOverlay: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'flex-end',
      padding: 16,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    previewWrap: {
      alignItems: 'center',
    },
    stickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    stickerTile: {
      alignItems: 'center',
      aspectRatio: 1,
      backgroundColor: colors.cardMuted,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: 'center',
      width: 48,
    },
    stickerTileSymbol: {
      fontSize: 24,
      lineHeight: 30,
    },
    stickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
  });
}
