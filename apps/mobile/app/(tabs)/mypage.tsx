import Constants from "expo-constants";
import { StyleSheet, Text, View } from "react-native";

export default function MyPageScreen() {
  const baseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    Constants.expoConfig?.extra?.apiBaseUrl ||
    "미설정";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>마이페이지</Text>
      <Text style={styles.body}>
        계정 상태, 저장한 결과물, 앱 설정, 로그아웃 흐름을 묶을 기본 화면입니다.
      </Text>
      <View style={styles.panel}>
        <Text style={styles.label}>API Base URL</Text>
        <Text style={styles.value}>{baseUrl}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: "#FFF8F5",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2E221D",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5F514A",
  },
  panel: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F0DED7",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8C7B73",
    textTransform: "uppercase",
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    color: "#2E221D",
  },
});
