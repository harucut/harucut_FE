import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from '@harucut/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScrollView, PageHeader, SurfaceCard } from '@/components/harucut/ui';
import { useHarucutTheme } from '@/hooks/use-harucut-theme';

function LegalDocumentScreen({ document }: { document: LegalDocument }) {
  const { colors } = useHarucutTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const bottomPadding = Math.max(insets.bottom, 16);

  return (
    <AppScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
      <PageHeader description={`시행일 ${document.effectiveDate}`} title={document.title} />
      <SurfaceCard style={{ gap: 18 }}>
        <Text style={styles.intro}>{document.intro}</Text>
        {document.sections.map((section) => (
          <View key={section.heading} style={{ gap: 6 }}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.paragraphs?.map((paragraph) => (
              <Text key={paragraph} style={styles.body}>
                {paragraph}
              </Text>
            ))}
            {section.bullets?.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>•</Text>
                <Text style={[styles.body, { flex: 1 }]}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
      </SurfaceCard>
      <Pressable
        accessibilityLabel="이전 화면으로 돌아가기"
        accessibilityRole="button"
        onPress={() => router.back()}>
        <Text style={styles.backLink}>이전 화면으로 돌아가기</Text>
      </Pressable>
    </AppScrollView>
  );
}

export function TermsScreen() {
  return <LegalDocumentScreen document={TERMS_OF_SERVICE} />;
}

export function PrivacyScreen() {
  return <LegalDocumentScreen document={PRIVACY_POLICY} />;
}

function createStyles(colors: ReturnType<typeof useHarucutTheme>['colors']) {
  return StyleSheet.create({
    backLink: {
      color: colors.textSoft,
      fontSize: 12,
      paddingVertical: 6,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
    body: {
      color: colors.textSoft,
      fontSize: 13,
      lineHeight: 20,
    },
    bulletMark: {
      color: colors.textSoft,
      fontSize: 13,
      lineHeight: 20,
    },
    bulletRow: {
      flexDirection: 'row',
      gap: 6,
    },
    heading: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    intro: {
      color: colors.textSoft,
      fontSize: 13,
      lineHeight: 20,
    },
  });
}
