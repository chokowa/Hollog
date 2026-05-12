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
  readClipboardText(): Promise<{ text: string }>;
  saveImages(options: { items: NativeSaveMediaItem[] }): Promise<{ savedCount: number }>;
  saveJsonFile(options: { fileName: string; content: string }): Promise<{ cancelled?: boolean; uri?: string }>;
  openJsonFile(): Promise<{ cancelled?: boolean; uri?: string; name?: string; content?: string }>;
};

const BocchiMedia = registerPlugin<BocchiMediaPlugin>("BocchiMedia");

export function pickNativeImages(limit: number) {
  return BocchiMedia.pickImages({ limit });
}

export function readNativeClipboardImages(limit: number) {
  return BocchiMedia.readClipboardImages({ limit });
}

export function readNativeClipboardText() {
  return BocchiMedia.readClipboardText();
}

export function saveNativeImages(items: NativeSaveMediaItem[]) {
  return BocchiMedia.saveImages({ items });
}

export function saveNativeJsonFile(fileName: string, content: string) {
  return BocchiMedia.saveJsonFile({ fileName, content });
}

export function openNativeJsonFile() {
  return BocchiMedia.openJsonFile();
}
