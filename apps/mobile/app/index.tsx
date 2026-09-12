import { HarucutWebShell } from '@/components/harucut-web-shell';

/** 앱의 유일한 화면. 나머지는 전부 웹이 그린다. */
export default function IndexRoute() {
  return <HarucutWebShell />;
}
