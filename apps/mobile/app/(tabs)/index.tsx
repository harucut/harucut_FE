import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SERVICE_CARDS } from '@/constants/service';

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Harucut Mobile</Text>
        <Text style={styles.title}>촬영부터 저장까지, 하루컷을 앱으로 옮기는 첫 골격</Text>
        <Text style={styles.description}>
          웹의 흐름을 그대로 복제하지 않고, 모바일에서 빠르게 쓰기 좋은 구조부터 맞춥니다.
          지금은 홈, 촬영, 업로드, 히스토리, 마이페이지와 테마 진입점을 먼저 정리한 상태입니다.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>핵심 진입점</Text>
        {SERVICE_CARDS.map((card) => (
          <View key={card.title} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardBody}>{card.description}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>다음 구현 방향</Text>
        <Text style={styles.listItem}>- 인증 토큰을 Secure Store에 저장하고 웹 API와 연결</Text>
        <Text style={styles.listItem}>- 촬영과 업로드 흐름을 앱 라우트로 세분화</Text>
        <Text style={styles.listItem}>- 히스토리와 마이페이지를 웹 서비스 데이터와 연결</Text>
        <Link href="/theme" style={styles.link}>
          테마 편집 설계 화면 보기
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 20,
    backgroundColor: '#FFF8F5',
  },
  hero: {
    gap: 10,
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#241B17',
  },
  eyebrow: {
    color: '#F2C6B6',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFF8F5',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  description: {
    color: '#EAD8D1',
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#2E221D',
  },
  card: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0DED7',
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2E221D',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6C5E57',
  },
  listItem: {
    fontSize: 14,
    lineHeight: 21,
    color: '#4B3F39',
  },
  link: {
    fontSize: 15,
    fontWeight: '700',
    color: '#C5674D',
  },
});
