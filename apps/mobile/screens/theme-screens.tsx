import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FrameCapacityMeter, FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, StepProgress, SurfaceCard } from '@/components/harucut/ui';
import { BACKGROUND_SWATCHES, THEME_STICKERS, type ThemeAsset, type ThemeComponentType, type ThemeEditorComponent } from '@/constants/harucut-data';
import { resolvePlanInfo } from '@/constants/plan-limits';
import type { HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { getApiErrorMessage } from '@/lib/api-client';
import { getPresignedImageUrl, resolveUploadContentType, uploadLocalFileWithPresigned } from '@/lib/file-storage-api';
import { useLibraryStore } from '@/store/use-library-store';
import { useSessionStore } from '@/store/use-session-store';
import { useThemeEditorStore } from '@/store/use-theme-editor-store';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

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
  const plan = resolvePlanInfo(planTier);
  // 보관함이 요금제 한도에 도달하면 새 프레임 생성 진입을 막는다(서버 한도 우회 방지).
  const isAtCapacity = savedFrames.length >= plan.limit;

  useEffect(() => {
    if (accessMode === 'member') {
      void loadRemoteFrames();
      void refreshUserProfile().catch(() => {});
    }
  }, [accessMode, loadRemoteFrames, refreshUserProfile]);

  return (
    <AppScrollView>
      <PageHeader backLabel="처음으로" onPressBack={() => push('/home')} />
      <StepProgress current={1} label="프레임 선택" total={2} />
      <FrameCapacityMeter onUpgrade={() => push('/mypage')} plan={plan} used={savedFrames.length} />
      <FramePickerSection
        confirmLabel={
          isAtCapacity ? '보관함이 가득 찼어요 · 업그레이드' : '새 프레임 만들기'
        }
        onConfirm={() => push(isAtCapacity ? '/pricing' : '/theme/sticker')}
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
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [textDraft, setTextDraft] = useState('하루컷');
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
          <Text style={styles.sectionTitle}>미리보기</Text>
          {activeComponent ? <Text style={styles.activeBadge}>{activeComponent.type}</Text> : null}
        </View>
        <View collapsable={false} ref={previewRef} style={styles.previewWrap}>
          <FramePreview
            activeComponentId={themeEditor.activeComponentId}
            backgroundColor={themeEditor.backgroundColor}
            backgroundImageUri={themeEditor.backgroundImageUri ?? undefined}
            components={themeEditor.components}
            editorMode
            frameId={themeEditor.frameId}
            onSelectComponent={setThemeActiveComponent}
            onTransformComponent={transformThemeComponent}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>소재</Text>
        <View style={styles.tabRow}>
          {(['PHOTO', 'STICKER', 'TEXT'] as ThemeComponentType[]).map((tab) => (
            <Pill key={tab} active={themeEditor.tab === tab} onPress={() => setThemeTab(tab)}>
              {tab === 'PHOTO' ? '사진' : tab === 'STICKER' ? '스티커' : '텍스트'}
            </Pill>
          ))}
        </View>

        {themeEditor.tab === 'PHOTO' ? (
          <View style={{ gap: 12 }}>
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
          </View>
        ) : null}

        {themeEditor.tab === 'STICKER' ? (
          <View style={styles.stickerGrid}>
            {THEME_STICKERS.map((sticker) => (
              <Pill
                key={sticker.id}
                onPress={() => addThemeComponentFromAsset('STICKER', sticker.symbol)}>
                {sticker.symbol} {sticker.label}
              </Pill>
            ))}
          </View>
        ) : null}

        {themeEditor.tab === 'TEXT' ? (
          <View style={{ gap: 12 }}>
            <FormField
              label="텍스트"
              onChangeText={setTextDraft}
              placeholder="하루컷"
              value={textDraft}
            />
            <ActionButton label="텍스트 추가" onPress={() => addThemeText(textDraft)} />
          </View>
        ) : null}
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>배경</Text>
        <Text style={styles.bodyText}>색 또는 이미지를 고르면 사진 칸 뒤에 깔려요.</Text>
        <View style={styles.filterWrap}>
          {BACKGROUND_SWATCHES.map((color) => (
            <Pill
              key={color.value}
              active={!themeEditor.backgroundImageUri && themeEditor.backgroundColor === color.value}
              onPress={() => setThemeBackgroundColor(color.value)}>
              {color.label}
            </Pill>
          ))}
        </View>
        <View style={styles.filterWrap}>
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="image-outline" size={16} />}
            label={themeEditor.backgroundImageUri ? '배경 이미지 변경' : '배경 이미지 선택'}
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
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>레이어</Text>
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
    stickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tabRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
  });
}
