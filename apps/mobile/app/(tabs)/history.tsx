import { StyleSheet, Text, View } from 'react-native';

export default function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>히스토리</Text>
      <Text style={styles.body}>
        저장된 결과물, 최근 작업, 다시 편집 가능한 세션 목록을 보여 줄 자리입니다.
        웹의 history 흐름과 API 계약을 그대로 참고하되 모바일 읽기 경험에 맞게 다시 구성합니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: '#FFF8F5',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2E221D',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5F514A',
  },
});
