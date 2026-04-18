import { StyleSheet, Text, View } from 'react-native';

export default function ShootScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>촬영</Text>
      <Text style={styles.body}>
        카메라 권한, 프레임 가이드, 촬영 세션 상태를 이 화면 기준으로 확장합니다.
        현재는 하루컷 모바일에서 어떤 순서로 촬영을 시작할지 잡아두는 단계입니다.
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
