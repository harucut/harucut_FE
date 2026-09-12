declare module "*.css";

/**
 * `libheif-js` 는 `wasm-bundle` 진입점에 타입을 달아 주지 않는다(패키지 안에
 * `libheif-wasm/libheif.d.ts` 가 있지만 그 진입점과 연결돼 있지 않다).
 *
 * **우리가 실제로 쓰는 것만** 적는다. 전체를 옮겨 적으면 라이브러리가 올라갈 때 조용히
 * 어긋난다 — 쓰지도 않는 선언이 맞는지는 아무도 확인하지 않는다.
 * 왜 이 진입점을 골랐고 무엇을 하는지는 `lib/imageDecode.ts` 에 있다.
 */
declare module "libheif-js/wasm-bundle" {
  export type HeifImage = {
    get_width: () => number;
    get_height: () => number;
    /** RGBA 를 넘겨준 버퍼에 채우고 콜백을 부른다. 실패하면 인자가 비어 온다. */
    display: (
      target: { data: Uint8ClampedArray; width: number; height: number },
      done: (result: unknown) => void,
    ) => void;
  };

  export type HeifDecoder = {
    /** 컨테이너 안의 이미지 전부. 라이브 포토처럼 여러 장일 수 있다. */
    decode: (bytes: Uint8Array) => HeifImage[];
  };

  const libheif: {
    HeifDecoder: new () => HeifDecoder;
  };

  export default libheif;
}
