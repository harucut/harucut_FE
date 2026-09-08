// react-konva 컴포넌트 재노출 래퍼.
//
// 일부 빌드 환경(예: Vercel이 이전 배포의 빌드 캐시를 복원해 node_modules의 @types/react
// 해상도가 락파일과 어긋나는 경우)에서 react-konva 컴포넌트의 JSX 타입이
//   "JSX element type 'Stage' does not have any construct or call signatures"
// 로 깨져 next build의 타입체크가 실패한다. 동일 락파일을 쓰는 로컬/CI(Ubuntu, next build)에서는
// 통과하지만 캐시가 낀 환경에서만 깨지므로, 호출 가능한 컴포넌트 타입으로 단언해 어떤 환경에서도
// 빌드되도록 한다. (근본 해결은 Vercel 빌드 캐시 무효화 후 재배포 — 이 래퍼는 환경과 무관하게
// 빌드를 보장하는 안전장치다.)
//
// 컴포넌트 값의 construct/call signature만 환경에 따라 깨지므로, props 타입은 konva의 이벤트 타입을
// 그대로 살려 핸들러 인자(e/oldBox/newBox)의 타입 추론을 유지한다(나머지 konva config props는
// 인덱스 시그니처로 허용).
import type { ReactNode, Ref } from "react";
import type Konva from "konva";
import {
  Stage as RKStage,
  Layer as RKLayer,
  Rect as RKRect,
  Group as RKGroup,
  Transformer as RKTransformer,
  Image as RKImage,
  Text as RKText,
} from "react-konva";

type PointerEvt = Konva.KonvaEventObject<MouseEvent | TouchEvent>;
type DragEvt = Konva.KonvaEventObject<DragEvent>;
type TransformEvt = Konva.KonvaEventObject<Event>;
// konva Transformer boundBoxFunc의 박스 타입(외부 모듈 경로 해상도에 의존하지 않도록 직접 정의).
type Box = { x: number; y: number; width: number; height: number; rotation: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
type KonvaComponentProps = {
  ref?: Ref<any>;
  children?: ReactNode;
  onMouseDown?: (e: PointerEvt) => void;
  onMouseMove?: (e: PointerEvt) => void;
  onMouseUp?: (e: PointerEvt) => void;
  onMouseEnter?: (e: PointerEvt) => void;
  onMouseLeave?: (e: PointerEvt) => void;
  onClick?: (e: PointerEvt) => void;
  onTap?: (e: PointerEvt) => void;
  onTouchStart?: (e: PointerEvt) => void;
  onTouchMove?: (e: PointerEvt) => void;
  onTouchEnd?: (e: PointerEvt) => void;
  onDragStart?: (e: DragEvt) => void;
  onDragMove?: (e: DragEvt) => void;
  onDragEnd?: (e: DragEvt) => void;
  onTransform?: (e: TransformEvt) => void;
  onTransformEnd?: (e: TransformEvt) => void;
  boundBoxFunc?: (oldBox: Box, newBox: Box) => Box;
  [key: string]: unknown;
};
type KonvaComponent = (props: KonvaComponentProps) => any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const Stage = RKStage as unknown as KonvaComponent;
export const Layer = RKLayer as unknown as KonvaComponent;
export const Rect = RKRect as unknown as KonvaComponent;
export const Group = RKGroup as unknown as KonvaComponent;
export const Transformer = RKTransformer as unknown as KonvaComponent;
export const Image = RKImage as unknown as KonvaComponent;
export const Text = RKText as unknown as KonvaComponent;
