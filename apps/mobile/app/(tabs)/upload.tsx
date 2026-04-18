import { StyleSheet, Text, View } from 'react-native';

export default function UploadScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>업로드</Text>
      <Text style={styles.body}>
        앨범 선택, 업로드, 미리보기, 결과 생성 흐름을 이 화면부터 확장합니다.
        `expo-image-picker`와 후속 업로드 API 연결을 붙일 자리입니다.
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
