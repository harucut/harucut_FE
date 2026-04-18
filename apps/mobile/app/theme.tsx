import { StyleSheet, Text, View } from 'react-native';

export default function ThemeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>테마 편집</Text>
      <Text style={styles.body}>
        현재 웹의 Konva 기반 편집기를 그대로 옮기지 않고, 모바일에 맞는 테마 선택과 편집 흐름을 별도로 설계합니다.
      </Text>
      <Text style={styles.note}>
        다음 단계에서 프레임 선택, 스티커, 색상, 결과 미리보기를 앱용 컴포넌트로 나눕니다.
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
  note: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FDEDE7',
    color: '#8A4D38',
    fontSize: 14,
    lineHeight: 20,
  },
});
