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

// 7행 피처 매트릭스. 웹 constants/plans.ts와 같은 값/순서를 공유한다.
// 워터마크는 전 플랜 기본 포함. Free는 제거 불가, Plus·Pro는 해제 가능(기본값은 항상 포함).
const PLANS: Plan[] = [
  {
    cta: '무료로 시작하기',
    feats: [
      ['커스텀 프레임', false],
      ['워터마크 해제', false, '기본 포함 (고정)'],
      ['사진 보관 기간', true, '3일'],
      ['보정', false],
      ['광고 제거', false, '보정·다운로드 시 노출'],
      ['AI (추후)', false],
      ['동영상 (추후)', false],
    ],
    id: 'basic',
    name: 'Free',
    price: '무료',
    sub: '가입 시 제공',
  },
  {
    badge: '인기',
    cta: 'Plus 시작하기',
    feats: [
      ['커스텀 프레임', true, '3개'],
      ['워터마크 해제', true, '선택 (기본 포함)'],
      ['사진 보관 기간', true, '3달'],
      ['보정', true],
      ['광고 제거', true],
      ['AI (추후)', false],
      ['동영상 (추후)', false, '미정'],
    ],
    hot: true,
    id: 'plus',
    name: 'Plus',
    price: '₩3,900',
    sub: '/ 월',
  },
  {
    cta: 'Pro 시작하기',
    feats: [
      ['커스텀 프레임', true, '무제한'],
      ['워터마크 해제', true, '선택 (기본 포함)'],
      ['사진 보관 기간', true, '무제한'],
      ['보정', true],
      ['광고 제거', true],
      ['AI (추후)', true],
      ['동영상 (추후)', false, '미정'],
    ],
    id: 'pro',
    name: 'Pro',
    price: '₩9,900',
    sub: '/ 월',
  },
];

// Enterprise — 추후 출시 예정(팬미팅·행사용 QR 촬영).
const ENTERPRISE_TEASER = {
  badge: '추후',
  desc: '팬미팅·행사용 플랜이에요. 공간을 미리 만들어 두면 비회원도 QR로 입장해 그 자리에서 누구나 네 컷을 찍을 수 있어요.',
  name: 'Enterprise',
};

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
          비회원도 촬영은 무료예요. 커스텀 프레임·보정·보관 기간은 플랜에 따라 달라요.
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

      <View style={styles.enterpriseCard}>
        <View style={styles.enterpriseHeader}>
          <Text style={styles.enterpriseName}>{ENTERPRISE_TEASER.name}</Text>
          <View style={styles.enterpriseBadge}>
            <Text style={styles.enterpriseBadgeLabel}>{ENTERPRISE_TEASER.badge}</Text>
          </View>
        </View>
        <Text style={styles.enterpriseDesc}>{ENTERPRISE_TEASER.desc}</Text>
      </View>

      <Text style={styles.footnote}>
        가격은 부가세 포함이에요. 요금제를 내리면 하위 플랜의 보관 기간·개수까지만 유지되고, 초과분은 삭제되지 않고 비활성화돼요.
      </Text>
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
    enterpriseBadge: {
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.chip,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    enterpriseBadgeLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '800',
    },
    enterpriseCard: {
      borderColor: colors.border,
      borderRadius: HARUCUT_RADII.lg,
      borderStyle: 'dashed',
      borderWidth: 1,
      gap: 8,
      marginTop: 14,
      padding: 18,
    },
    enterpriseDesc: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 19,
    },
    enterpriseHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    enterpriseName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
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
    footnote: {
      color: colors.muted,
      fontSize: 11.5,
      lineHeight: 17,
      marginTop: 14,
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
