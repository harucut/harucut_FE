import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BACKGROUND_SWATCHES, THEME_STICKERS } from '@/constants/harucut-data';
import { HARUCUT_COLORS } from '@/constants/harucut-design';
import { FramePickerSection, FramePreview, SavedFramesPanel } from '@/components/harucut/frame';
import { ActionButton, AppScrollView, FormField, PageHeader, Pill, StepProgress, SurfaceCard } from '@/components/harucut/ui';
import { useHarucutStore } from '@/store/use-harucut-store';

export function ThemeFrameScreen() {
  const router = useRouter();
  const push = (path: string) => router.push(path as never);
  const savedFrames = useHarucutStore((state) => state.savedFrames);
  const themeEditor = useHarucutStore((state) => state.themeEditor);
  const setThemeFrame = useHarucutStore((state) => state.setThemeFrame);
  const selectSavedFrameForTheme = useHarucutStore((state) => state.selectSavedFrameForTheme);

  return (
    <AppScrollView>
      <PageHeader backLabel="처음으로" onPressBack={() => push('/home')} title="프레임 꾸미기" />
      <StepProgress current={1} label="프레임 선택" total={2} />
      <FramePickerSection confirmLabel="새 프레임 만들기" onConfirm={() => push('/theme/sticker')} onSelect={setThemeFrame} selectedFrameId={themeEditor.frameId} />
      <SavedFramesPanel
        actionLabel="수정하기"
        description="같은 프레임 타입으로 저장한 프레임만 불러와서 수정할 수 있어요."
        emptyText="이 프레임 타입으로 저장한 프레임이 아직 없어요."
        frames={savedFrames}
        onAction={() => push('/theme/sticker')}
        onRefresh={() => undefined}
        onSelect={selectSavedFrameForTheme}
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
  const themeEditor = useHarucutStore((state) => state.themeEditor);
  const setThemeTitle = useHarucutStore((state) => state.setThemeTitle);
  const setThemeDescription = useHarucutStore((state) => state.setThemeDescription);
  const setThemeBackgroundColor = useHarucutStore((state) => state.setThemeBackgroundColor);
  const setThemeAccentColor = useHarucutStore((state) => state.setThemeAccentColor);
  const setThemeCaption = useHarucutStore((state) => state.setThemeCaption);
  const toggleThemeSticker = useHarucutStore((state) => state.toggleThemeSticker);
  const saveThemeFrame = useHarucutStore((state) => state.saveThemeFrame);
  const removeSavedFrame = useHarucutStore((state) => state.removeSavedFrame);

  useEffect(() => {
    if (!themeEditor.frameId) {
      router.replace('/theme' as never);
    }
  }, [router, themeEditor.frameId]);

  return (
    <AppScrollView>
      <PageHeader
        backLabel="프레임 목록으로"
        description={themeEditor.selectedSavedFrameId ? '저장한 프레임 수정' : '프레임 꾸미기'}
        onPressBack={() => push('/theme')}
        title={themeEditor.selectedSavedFrameId ? '저장한 프레임 수정' : '프레임 꾸미기'}
      />

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>프레임 정보</Text>
        <Text style={styles.bodyText}>저장 시 모바일 앱 안에서 다시 불러올 제목과 설명이에요.</Text>
        <FormField label="프레임 이름" onChangeText={setThemeTitle} placeholder="프레임 이름을 입력해 주세요" value={themeEditor.title} />
        <FormField
          label="프레임 설명"
          multiline
          onChangeText={setThemeDescription}
          placeholder="프레임 설명을 입력해 주세요"
          style={{ minHeight: 88, paddingTop: 14 }}
          value={themeEditor.description}
        />
      </SurfaceCard>

      <SurfaceCard style={{ gap: 14 }}>
        <Text style={styles.sectionTitle}>미리보기</Text>
        <FramePreview
          accentColor={themeEditor.accentColor}
          backgroundColor={themeEditor.backgroundColor}
          caption={themeEditor.caption}
          frameId={themeEditor.frameId}
        />
        <View style={styles.stickerRow}>
          {themeEditor.stickers.map((sticker) => (
            <Pill key={sticker}>{sticker}</Pill>
          ))}
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>에셋 패널</Text>
        <Text style={styles.bodyText}>스티커, 사진, 글을 조합해 나만의 프레임을 만들어요.</Text>
        <View style={styles.stickerGrid}>
          {THEME_STICKERS.map((sticker) => {
            const active = themeEditor.stickers.includes(sticker.symbol);
            return (
              <Pill key={sticker.id} active={active} onPress={() => toggleThemeSticker(sticker.symbol)}>
                {sticker.symbol} {sticker.label}
              </Pill>
            );
          })}
        </View>
        <FormField label="캡션" onChangeText={setThemeCaption} placeholder="today archive" value={themeEditor.caption} />
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>배경색</Text>
        <View style={styles.filterWrap}>
          {BACKGROUND_SWATCHES.map((color) => (
            <Pill
              key={color.value}
              active={themeEditor.backgroundColor === color.value}
              onPress={() => setThemeBackgroundColor(color.value)}>
              {color.label}
            </Pill>
          ))}
        </View>
        <Text style={styles.sectionTitle}>포인트 컬러</Text>
        <View style={styles.filterWrap}>
          {BACKGROUND_SWATCHES.map((color) => (
            <Pill
              key={`accent-${color.value}`}
              active={themeEditor.accentColor === color.value}
              onPress={() => setThemeAccentColor(color.value)}>
              {color.label}
            </Pill>
          ))}
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>레이어 패널</Text>
        <View style={styles.layerList}>
          <Text style={styles.layerItem}>배경 · {themeEditor.backgroundColor}</Text>
          <Text style={styles.layerItem}>캡션 · {themeEditor.caption || '없음'}</Text>
          <Text style={styles.layerItem}>스티커 · {themeEditor.stickers.length}개</Text>
          <Text style={styles.layerItem}>포인트 컬러 · {themeEditor.accentColor}</Text>
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ gap: 12 }}>
        <Text style={styles.sectionTitle}>인스펙터 패널</Text>
        <Text style={styles.bodyText}>
          선택한 프레임 타입에 맞춰 배경, 캡션, 스티커 구성을 정리한 뒤 저장할 수 있어요.
        </Text>
        <ActionButton
          icon={<Ionicons color="#FFFFFF" name="save-outline" size={16} />}
          label={themeEditor.selectedSavedFrameId ? '수정 저장' : '저장'}
          onPress={() => {
            saveThemeFrame();
            push('/theme');
          }}
        />
        {themeEditor.selectedSavedFrameId ? (
          <ActionButton
            icon={<Ionicons color="#FFFFFF" name="trash-outline" size={16} />}
            label="삭제"
            onPress={() => {
              removeSavedFrame(themeEditor.selectedSavedFrameId as string);
              push('/theme');
            }}
            variant="danger"
          />
        ) : null}
      </SurfaceCard>
    </AppScrollView>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: HARUCUT_COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  layerItem: {
    color: HARUCUT_COLORS.text,
    fontSize: 12,
    lineHeight: 18,
  },
  layerList: {
    gap: 8,
  },
  sectionTitle: {
    color: HARUCUT_COLORS.text,
    fontSize: 18,
    fontWeight: '700',
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
});
