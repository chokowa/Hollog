import { registerPlugin } from "@capacitor/core";

export type NativePickedMedia = {
  id: string;
  kind: "image" | "video";
  storage: "device-reference" | "app-local-copy";
  uri: string;
  mimeType?: string;
  name?: string;
  previewDataUrl?: string;
};

export type NativeSaveMediaItem = {
  uri?: string;
  dataUrl?: string;
  mimeType?: string;
  name?: string;
};

type BocchiMediaPlugin = {
  pickImages(options: { limit: number }): Promise<{ items: NativePickedMedia[] }>;
  readClipboardImages(options: { limit: number }): Promise<{ items: NativePickedMedia[] }>;
  saveImages(options: { items: NativeSaveMediaItem[] }): Promise<{ savedCount: number }>;
};

const BocchiMedia = registerPlugin<BocchiMediaPlugin>("BocchiMedia");

export function pickNativeImages(limit: number) {
  return BocchiMedia.pickImages({ limit });
}

export function readNativeClipboardImages(limit: number) {
  return BocchiMedia.readClipboardImages({ limit });
}

export function saveNativeImages(items: NativeSaveMediaItem[]) {
  return BocchiMedia.saveImages({ items });
}
