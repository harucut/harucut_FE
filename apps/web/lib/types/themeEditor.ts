import type { FrameId } from "@/constants/frames";

export type ComponentType = "PHOTO" | "STICKER" | "TEXT";

export type TextStyleJson = {
  fontFamily: string;
  fontSize: number;
  color: string;
  textAlign: "left" | "center" | "right";
  opacity?: number;
};

export type CommonStyleJson = {
  opacity?: number;
};

export type BaseComponent = {
  id: string;
  type: ComponentType;

  /**
   * PHOTO/STICKER: 이미지 위치, TEXT: 글자 내용.
   *
   * 이미지의 경우 저장 직전에 **S3 key** 로 바뀐다(`finalizeAssetsForSave`).
   * 서버는 key 만 읽는다 — https URL 이나 `/stickers/x.png` 같은 정적 경로를 보내면
   * 그 프레임으로 네컷 합성이 400 GEN-002 로 거부된다.
   */
  source: string;

  /**
   * 화면에 그릴 때만 쓰는 주소. **서버로 보내지 않는다.**
   *
   * `source` 가 S3 key 가 된 뒤에도 캔버스는 그림을 그려야 해서 따로 둔다.
   * 배경(`ThemeBackground.url`)이 쓰는 것과 같은 방식이다.
   */
  renderUrl?: string;

  /**
   * TEXT 전용. 글자 층만 투명 PNG 로 구워 올린 S3 key.
   *
   * 서버는 글자를 그리지 않는다 — 브라우저와 폰트가 달라 편집 화면과 결과물이
   * 어긋나는 걸 막으려고 사용자가 본 픽셀을 그대로 쓴다. 없으면 그 프레임으로
   * 합성이 400 GEN-002 로 죽는다. 글자나 스타일이 바뀌면 반드시 다시 구워야 한다.
   */
  renderedKey?: string;

  x: number;
  y: number;
  width: number;
  height: number;

  scale: number;
  rotation: number;
  zIndex: number;

  styleJson?: CommonStyleJson | TextStyleJson;
  locked?: boolean;
  hidden?: boolean;
};

export type PhotoComponent = BaseComponent & {
  type: "PHOTO";
  styleJson?: CommonStyleJson;
};

export type StickerComponent = BaseComponent & {
  type: "STICKER";
  styleJson?: CommonStyleJson;
};

export type TextComponent = BaseComponent & {
  type: "TEXT";
  styleJson: TextStyleJson;
};

export type EditorComponent = PhotoComponent | StickerComponent | TextComponent;

export type Asset = {
  id: string;
  src: string;
  name?: string;
  s3Key?: string;
  file?: File;
};

export type ThemeBackground =
  | {
      type: "COLOR";
      value: string;
    }
  | {
      type: "IMAGE";
      key?: string;
      opacity?: number;
      // 클라이언트에서 key를 해석해 채우는 렌더 전용 URL (서버 전송 X).
      url?: string;
    };

export type ThemeExportJson = {
  frameId: FrameId;
  background?: ThemeBackground;
  // 셀별 누끼(배경 제거) 상태. 서버 계약에도 `cellCutouts` 가 있어 그대로 저장된다
  // (boolean 4개 고정, 촬영 슬롯 순서). 생략하면 서버는 전부 끈 것으로 본다.
  cellCutouts?: boolean[];
  components: Array<{
    id: string;
    type: ComponentType;
    /** 이미지는 S3 key(저장 후). TEXT 는 글자 내용. */
    source: string;
    /** 렌더 전용 주소. 서버로 보내지 않는다. */
    renderUrl?: string;
    /** TEXT 전용. 구운 글자 층의 S3 key. */
    renderedKey?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    rotation: number;
    zIndex: number;
    styleJson?: Record<string, unknown>;
  }>;
};
