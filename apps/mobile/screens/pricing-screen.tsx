import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScrollView } from '@/components/harucut/ui';
import { HARUCUT_RADII, type HarucutColors } from '@/constants/harucut-design';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';
import { useSessionStore } from '@/store/use-session-store';

import {
  ENTERPRISE_FACTS,
  PAYMENTS_ENABLED,
  PLAN_FACTS,
  toPlanId,
  type PlanFacts,
  type PlanFeature,
  type PlanId,
} from '@harucut/shared';

// 요금제 사실(가격·피처 표·Enterprise 안내)은 packages/shared/src/plans.ts 가 단일 소스다.
// 예전에는 웹과 앱이 같은 표를 각자 하드코딩하고 "함께 맞춘다"는 주석만 달아 뒀는데,
// 웹에서 사실이 아닌 항목(근거 없는 "인기" 배지, 아직 못 쓰는 AI 의 체크)을 걷어냈을 때
// 여기엔 그대로 남아 같은 제품이 플랫폼마다 다른 말을 했다. 이제 한 곳에서 읽는다.
type Plan = PlanFacts & {
  badge?: string;
  cta: string;
};

const CTA_BY_ID: Record<PlanId, string> = {
  basic: '무료로 시작하기',
  plus: 'Plus 시작하기',
  pro: 'Pro 시작하기',
};

const PLANS: Plan[] = PLAN_FACTS.map((plan) => ({
  ...plan,
  cta: CTA_BY_ID[plan.id],
}));

function PlanCard({
  current,
  isMember,
  onPick,
  plan,
  styles,
  colors,
}: {
  colors: HarucutColors;
  /** 이 카드가 지금 이용 중인 플랜인지. */
  current: boolean;
  isMember: boolean;
  onPick: () => void;
  plan: Plan;
  styles: ReturnType<typeof createStyles>;
}) {
  // 현재 플랜 표시가 다른 배지보다 우선이다.
  const badge = current ? '현재 플랜' : plan.badge;
  // 무료 플랜만 지금 시작할 수 있다. 결제가 닫힌 동안에는 살 수 없는 카드를 강조하지 않고,
  // 시선을 지금 할 수 있는 것으로 보낸다(웹과 같은 규칙).
  const isPurchasable = PAYMENTS_ENABLED || plan.id === 'basic';
  const hot = PAYMENTS_ENABLED ? plan.hot : plan.id === 'basic';

  return (
    <View style={[styles.card, hot ? styles.cardHot : null, current ? styles.cardCurrent : null]}>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{badge}</Text>
        </View>
      ) : null}

      <Text style={[styles.planName, hot || current ? styles.planNameHot : null]}>
        {plan.name}
      </Text>

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

      {/*
        CTA — 이용 중인 플랜은 누를 곳이 없다.

        결제가 닫힌 동안 유료 카드에는 버튼을 두지 않는다(웹 PricingView 와 같은 규칙).
        ₩3,900 이 적힌 카드에 "Plus 시작하기"가 달려 있으면 눌러서 올라갈 수 있다는
        말이 되는데, 실제로는 아무도 유료 플랜에 올라갈 수 없다.
      */}
      {current ? (
        <View style={styles.ctaCurrent}>
          <Text style={styles.ctaCurrentLabel}>현재 이용 중</Text>
        </View>
      ) : !isPurchasable ? (
        <View style={styles.ctaCurrent}>
          <Text style={styles.ctaCurrentLabel}>결제 준비 중</Text>
        </View>
      ) : (
        <ActionButton
          label={plan.cta}
          onPress={onPick}
          style={styles.cta}
          variant={hot ? 'primary' : 'secondary'}
        />
      )}
    </View>
  );
}

export function PricingScreen() {
  const { colors, isDark } = useHarucutTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const accessMode = useSessionStore((state) => state.accessMode);
  const planTier = useSessionStore((state) => state.user.planTier);
  // 세션 스토어의 user는 비로그인일 때도 기본값(BASIC)을 갖는다.
  // 회원일 때만 현재 플랜으로 인정해야 게스트에게 'Free 이용 중'이 뜨지 않는다.
  const isMember = accessMode === 'member';
  const currentPlanId = isMember ? toPlanId(planTier) : null;

  // 회원 CTA는 비활성('준비 중')이라 눌리지 않는다. 비회원(anonymous·guest)만 가입 흐름으로 보낸다.
  /*
    카드 CTA 를 눌렀을 때.

    로그인한 회원에게 회원가입 화면을 열지 않는다 — Plus·Pro 회원이 Free 카드를 보면
    current 가 false 라 이 버튼이 눌리는데, 그대로 두면 이미 계정이 있는 사람에게
    가입 화면이 뜬다. 회원은 플랜을 다루는 자리(마이페이지)로 보낸다.
  */
  const handlePick = () => {
    router.push((isMember ? '/mypage' : '/signup') as never);
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
          {isMember
            ? '커스텀 프레임·보정·보관 기간은 플랜에 따라 달라요. 결제 기능은 준비 중이에요.'
            : '비회원도 촬영은 무료예요. 커스텀 프레임·보정·보관 기간은 플랜에 따라 달라요.'}
        </Text>
      </View>

      <View style={styles.cardStack}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            colors={colors}
            current={currentPlanId === plan.id}
            isMember={isMember}
            onPick={handlePick}
            plan={plan}
            styles={styles}
          />
        ))}
      </View>

      <View style={styles.enterpriseCard}>
        <View style={styles.enterpriseHeader}>
          <Text style={styles.enterpriseName}>{ENTERPRISE_FACTS.name}</Text>
          <View style={styles.enterpriseBadge}>
            <Text style={styles.enterpriseBadgeLabel}>{ENTERPRISE_FACTS.badge}</Text>
          </View>
          <Text style={styles.enterprisePrice}>{ENTERPRISE_FACTS.price}</Text>
        </View>
        <Text style={styles.enterpriseDesc}>{ENTERPRISE_FACTS.desc}</Text>
      </View>

      <Text style={styles.footnote}>
        결제 기능은 준비 중이에요. 가격은 부가세 포함이고, 요금제를 내리면 하위 플랜의 보관 기간·개수까지만 유지되고, 초과분은 삭제되지 않고 비활성화돼요.
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
    cardCurrent: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 2,
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
    ctaCurrent: {
      alignItems: 'center',
      borderColor: colors.primary,
      borderRadius: HARUCUT_RADII.chip,
      borderWidth: 1,
      height: 50,
      justifyContent: 'center',
      marginTop: 20,
    },
    ctaCurrentLabel: {
      color: colors.primaryStrong,
      fontSize: 14.5,
      fontWeight: '800',
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
    enterprisePrice: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '700',
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
