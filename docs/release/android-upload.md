# Android 테스트 업로드

`mobile-qa`는 설치 시험용 APK와 **서명되지 않은 AAB**를 별도 artifact로 남긴다.
APK는 Expo 기본 시험 서명이므로 Play Console에 제출하지 않는다.
AAB는 arm64-v8a와 x86_64를 포함하며, 로컬 업로드 키로 서명한 뒤 내부 테스트에 올린다.
CI와 공개 저장소에는 업로드 개인 키나 비밀번호를 보내지 않는다.

## 서명과 검증

1. GitHub Actions의 `harucut-android-unsigned-bundle-*` artifact를 내려받는다.
2. Play Console의 해당 앱에서 업로드 인증서가 이미 등록되어 있는지 확인한다.
   등록되어 있으면 같은 키를 사용한다. 기존 키를 임의로 교체하지 않는다.
3. 키와 비밀번호는 저장소 밖의 비공개 디렉터리(디렉터리 700, 파일 600)에 보관한다.
   키를 새로 만들었다면 별도 안전한 위치에도 백업한 뒤 첫 업로드를 진행한다.
4. JDK의 `jarsigner`로 서명한다. 비밀번호는 명령줄이나 로그에 적지 않고 파일로 읽힌다.

```sh
jarsigner -keystore /private/path/harucut-upload.jks \
  -storepass:file /private/path/store-password \
  -keypass:file /private/path/store-password \
  -sigalg SHA256withRSA -digestalg SHA-256 \
  -signedjar harucut-play.aab app-release.aab harucut-upload
jarsigner -verify harucut-play.aab
```

5. 검증 로그의 `jar verified`와 업로드 인증서 지문을 확인한다. 자체 서명 업로드 인증서는
   공개 CA 체인이 없는 것이 정상이다. 이는 앱 내용의 서명 검증 실패와 구분한다.
6. Play Console → 내부 테스트 → 새 버전에 서명한 AAB를 업로드한다. 앱 ID는
   `com.harucut.app`, 등록 이름은 `harucut`, 운영자는 `vailen`이다.
   첫 번들은 Console에서 올려야 하며 이후 자동 제출을 설정할 수 있다.

빌드 성공만으로 업로드·게시가 끝난 것은 아니다. Console의 처리 결과, 테스트 링크,
테스터 기기 설치와 카메라·기기 저장 동작까지 확인한다.

근거: [Android 명령줄 앱 번들 빌드/서명](https://developer.android.com/build/building-cmdline#build_bundle),
[Expo 로컬 릴리스 빌드](https://docs.expo.dev/guides/local-app-production/).
