import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScrollView } from '@/components/harucut/ui';
import { HARUCUT_RADII, type HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { useSessionStore } from '@/store/use-session-store';

type PlanFeature = [label: string, included: boolean, note?: string];

type Plan = {
  badge?: string;
  cta: string;
  feats: PlanFeature[];
  hot?: boolean;
  id: 'basic' | 'plus' | 'pro';
  name: string;
  price: string;
  sub: string;
};

// 핸드오프(handoff/app/pricing.jsx)와 1:1 일치하는 6행 피처 매트릭스.
const PLANS: Plan[] = [
  {
    cta: '시작하기',
    feats: [
      ['촬영·업로드', true, '이미지 무제한'],
      ['다운로드·저장', true],
      ['영상 생성', true, '월 5회'],
      ['프레임 보관', true, '1개'],
      ['사진 내역', true, '3일 보관'],
      ['워터마크 제거', false],
    ],
    id: 'basic',
    name: 'BASIC',
    price: '무료',
    sub: '가입 시 제공',
  },
  {
    badge: '인기',
    cta: 'PLUS 시작하기',
    feats: [
      ['촬영·업로드', true, '이미지 무제한'],
      ['다운로드·저장', true],
      ['영상 생성', true, '월 30회'],
      ['프레임 보관', true, '5개'],
      ['사진 내역', true, '무제한'],
      ['워터마크 제거', true],
    ],
    hot: true,
    id: 'plus',
    name: 'PLUS',
    price: '₩3,900',
    sub: '/ 월',
  },
  {
    cta: 'PRO 시작하기',
    feats: [
      ['촬영·업로드', true, '이미지 무제한'],
      ['다운로드·저장', true],
      ['영상 생성', true, '무제한'],
      ['프레임 보관', true, '10개'],
      ['사진 내역', true, '무제한'],
      ['워터마크 제거', true],
    ],
    id: 'pro',
    name: 'PRO',
    price: '₩7,900',
    sub: '/ 월',
  },
];

function PlanCard({
  onPick,
  plan,
  styles,
  colors,
}: {
  colors: HarucutColors;
  onPick: () => void;
  plan: Plan;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.card, plan.hot ? styles.cardHot : null]}>
      {plan.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{plan.badge}</Text>
        </View>
      ) : null}

      <Text style={[styles.planName, plan.hot ? styles.planNameHot : null]}>{plan.name}</Text>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{plan.price}</Text>
        <Text style={styles.priceSub}>{plan.sub}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.featList}>
        {plan.feats.map(([label, on, note]) => (
          <View key={label} style={[styles.featRow, on ? null : styles.featRowOff]}>
            <View style={[styles.featIcon, on ? styles.featIconOn : styles.featIconOff]}>
              <Ionicons
                color={on ? colors.primary : colors.muted}
                name={on ? 'checkmark' : 'close'}
                size={12}
              />
            </View>
            <Text style={styles.featLabel}>
              {label}
              {note ? (
                <Text style={[styles.featNote, on ? null : styles.featNoteOff]}> · {note}</Text>
              ) : null}
            </Text>
          </View>
        ))}
      </View>

      <ActionButton
        label={plan.cta}
        onPress={onPick}
        style={styles.cta}
        variant={plan.hot ? 'primary' : 'secondary'}
      />
    </View>
  );
}

export function PricingScreen() {
  const { colors, isDark } = useHarucutTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const accessMode = useSessionStore((state) => state.accessMode);

  const handlePick = () => {
    // 결제 백엔드 연동은 범위 밖. 회원만 마이페이지로, 그 외(anonymous·guest)는
    // 보호 라우트인 /mypage 대신 가입 흐름으로 안내한다.
    router.push((accessMode === 'member' ? '/mypage' : '/signup') as never);
  };

  return (
    <AppScrollView>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.push((accessMode === 'member' ? '/mypage' : '/') as never)
          }
          style={styles.backButton}>
          <Ionicons color={colors.text} name="arrow-back" size={20} />
        </Pressable>
        <Text style={styles.topTitle}>요금제</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.headerBlock}>
        <Text style={styles.headline}>나에게 맞는 플랜</Text>
        <Text style={styles.subtitle}>
          비회원도 촬영은 무료예요. 저장·영상·보관은 플랜에 따라 달라요.
        </Text>
      </View>

      <View style={styles.cardStack}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            colors={colors}
            onPick={handlePick}
            plan={plan}
            styles={styles}
          />
        ))}
      </View>
    </AppScrollView>
  );
}

function createStyles(colors: HarucutColors, isDark: boolean) {
  return StyleSheet.create({
    backButton: {
      alignItems: 'center',
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    badge: {
      backgroundColor: colors.primary,
      borderRadius: HARUCUT_RADII.chip,
      paddingHorizontal: 10,
      paddingVertical: 4,
      position: 'absolute',
      right: 16,
      top: 16,
    },
    badgeLabel: {
      color: isDark ? '#06140A' : '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.lg,
      borderWidth: 1,
      padding: 20,
      shadowColor: colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: isDark ? 0.26 : 1,
      shadowRadius: 38,
    },
    cardHot: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    cardStack: {
      gap: 14,
    },
    cta: {
      marginTop: 20,
    },
    divider: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 16,
    },
    featIcon: {
      alignItems: 'center',
      borderRadius: 999,
      height: 18,
      justifyContent: 'center',
      marginTop: 1,
      width: 18,
    },
    featIconOff: {
      borderColor: colors.border,
      borderWidth: 1.5,
    },
    featIconOn: {
      backgroundColor: colors.primarySoft,
    },
    featLabel: {
      color: colors.text,
      flex: 1,
      fontSize: 13.5,
      lineHeight: 19,
    },
    featList: {
      gap: 11,
    },
    featNote: {
      color: colors.text,
      fontWeight: '700',
    },
    featNoteOff: {
      color: colors.muted,
    },
    featRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 10,
    },
    featRowOff: {
      opacity: 0.4,
    },
    headerBlock: {
      gap: 8,
    },
    headline: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    planName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    planNameHot: {
      color: colors.primaryStrong,
    },
    price: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    priceRow: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 6,
      marginTop: 10,
    },
    priceSub: {
      color: colors.muted,
      fontSize: 13,
    },
    subtitle: {
      color: colors.textSoft,
      fontSize: 14,
      lineHeight: 21,
    },
    topBar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    topTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
