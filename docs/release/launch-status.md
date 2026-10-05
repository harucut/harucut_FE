# 웹·앱 출시 진행 상태

기준: 2026-10-05. [출시 PR #496](https://github.com/harucut/harucut_FE/pull/496)을 main에 병합했고 Vercel 운영 배포가 성공했다. 서버 코드는 변경하지 않았다.

## 반영한 동작

- 인증 취소·정지/탈퇴 계정·토큰 재발급 실패 처리, 동일 오리진 CSRF 검사, 비공개 응답 캐시 차단, 리소스 ID 검증.
- 시스템 프레임 제목의 `[배경]`·`[스티커]`를 분류하고 편집기에 표시. 등록 규칙은 [frame-assets.md](../frame-assets.md).
- 저장된 이미지의 서명 URL 사용, 배경/스티커 사용 시 사용자 자산으로 복사, 프레임 저장 한도를 업로드 전에 확인.
- 촬영 중 앱 전환 시 일시정지, 완료 사진 유지, IndexedDB에서 최대 24시간 복원, 명시적 로그아웃·탈퇴 시 임시 사진 삭제.
- 프레임 변경으로 사진을 지우기 전 확인, 사진 선택 비율 보존, 비회원 JPEG 저장·지원 브라우저의 파일 공유.
- iOS 캔버스 필터 대체 처리, JPEG 업로드 메타데이터 제거, 게스트 합성 레이어 순서 수정.
- 편집기 선택 핸들·레이어 순서·드래그 경계·좌표 입력, 모바일 미리보기 우선 배치.
- 장식용 자동 등장/반복 애니메이션 제거, 눌림 반응, 모달 배경 스크롤 잠금, 가입 오류 포커스·접근성 설명.
- 공통 캔버스·저장소·프록시·시간 제한 헬퍼 재사용, Storybook·사용하지 않는 시각 테스트/디버그 도구 제거.
- harucut 이름과 vailen 운영 표기, 검색 설명, [스토어 등록 문구](store-listing-ko.md).
- 모바일 React/RN 렌더러 버전 일치 검사, 공식 릴리스 주소 고정, `/home` 시작, apex OAuth 콜백을 www로 인계.
- Android 전체 미디어 읽기·위치·마이크·오버레이 권한 제외, OS 백업 비활성화. 최종 APK의 병합된 manifest를 CI에서 검사한다.

## 검증 범위

웹 Jest 90묶음 1,067건, lint, Tailwind 클래스 검사, 공유 타입 검사와 모바일 lint/typecheck/runtime 검사를 통과했다.
Node 22 CI에서 `verify:standard`와 Next.js 프로덕션 빌드를 통과했다. 로컬 Node 24의 간헐적 V8 SIGSEGV는 CI에서 재현되지 않았다.
Expo 57 / RN 0.86.3 공식 조합과 peer를 고정했고 Android QA APK와 iOS unsigned archive를 생성했다. **스토어 서명·실기기 검증·스토어 업로드 완료를 뜻하지 않는다.**

- [브라우저 CI](https://github.com/harucut/harucut_FE/actions/runs/37296846911): E2E 96건, 접근성 32건 통과. fake camera 촬영 → IndexedDB 보관 → 문서 재시작 복원 → 오프라인 추가 촬영 → 네 컷 선택 → 실제 JPEG 다운로드를 확인했다. 이 검사에서 발견한 `DataCloneError`도 수정했다. 공개 화면과 편집기의 데스크톱/모바일·라이트/다크 캡처를 검토했다.
- [운영 계약 CI](https://github.com/harucut/harucut_FE/actions/runs/37296846884): 2026-10-05 실제 `https://api.harucut.com/v3/api-docs`의 62개 연산과 FE 프록시 37개를 읽기 전용으로 대조했다. 경로/필수 필드 누락은 없다. 에러코드 7개는 Swagger 예시에 없어 경고로 남았다.
- [Android 네이티브 빌드](https://github.com/harucut/harucut_FE/actions/runs/37296846816): SDK 57 QA APK 생성과 최종 권한·백업 검사 통과. 시험 서명이므로 Play 제출용이 아니다.
- [iOS 네이티브 빌드](https://github.com/harucut/harucut_FE/actions/runs/37296846755): unsigned archive 생성 성공. TestFlight 제출용 서명은 별도다.
- 운영 main 커밋 `33777cbbf4214f7b705574a39812ec7411ed0ad6`의 Vercel 배포 성공. Chrome에서 `www.harucut.com`의 새 제목·vailen 검색 설명과 비회원 프레임 선택 → 촬영 화면 진입을 직접 확인했다. 실제 카메라 촬영을 완료한 검증은 아니다.

반복 CI 실패 원인은 Expo 55/RN 0.85 혼용, 구형 Reanimated/Worklets peer, 렌더 중 ref 수정이었다. 공식 SDK 57 조합으로 정렬하고 peer를 명시했으며 뒤로가기 ref 갱신은 layout effect로 옮겼다. 일회성 의존성 동기화 워크플로는 제거했고 최종 릴리스의 7개 검사는 모두 성공했다.

## 배포 전 남은 확인

- 이 실행 환경에서는 localhost 리슨·USB ADB·기본 Gradle 캐시 쓰기와 셸의 외부 DNS가 제한됐다. 브라우저 제어는 이후 연결됐지만 로컬 웹 E2E와 실기기 촬영은 확인하지 못했다. 로컬 node_modules는 새 SDK 재설치가 필요하며, 정상 네트워크 환경에서 `pnpm install --frozen-lockfile`을 실행한다.
- Android `mobile-qa` CI는 `run-ci` 라벨이 있는 PR에서 APK를 빌드한다. Expo 기본 시험 서명을 쓰므로 Play 배포용이 아니다. 이 APK는 공식 운영 웹을 연다. 새 웹 배포 전에는 변경 전 웹이 보인다.
- 로컬 iOS는 CocoaPods의 Hermes 다운로드가 차단돼 CI에서 네이티브 빌드를 검증했다. 서명 팀·앱 레코드·프로비저닝은 별도 확인이 필요하다.
- 일반 웹의 소셜 로그인은 유지한다. 앱 구글 로그인은 시스템 브라우저 인증과 안전한 세션 인계가 준비되지 않아 웹 이용을 안내한다. 카카오/네이버는 실제 운영 계정으로 쿠키 범위·복귀·취소를 확인해야 한다.
- App Store Connect와 Play Console에서 `com.harucut.app`에 해당하는 앱/팀을 확인하고, 심사용 계정과 개인정보 신고를 실제 데이터 처리와 맞춘다. vailen이라는 표시 이름만으로 판매자 계정이 선택되지는 않는다.
- 운영 약관 데이터, 이메일 인증 발송, 시스템 기본 프레임 4종, 실제 BASIC 저장 한도는 운영 데이터/계정으로 재확인한다. 기존 세션의 관찰을 현재 사실로 단정하지 않는다.
- 기존 `@imgly/background-removal`의 AGPL 조건과 현재 배포/라이선스 표기의 적합성은 아직 결정되지 않았다.

웹은 `develop` 검증 후 `main` 릴리스 PR로 배포하며, 두 보호 브랜치에 직접 push하지 않는다.
