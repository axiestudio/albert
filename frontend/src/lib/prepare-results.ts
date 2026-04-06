import type { PrepareResult } from "@/stores/prepare-store";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  return new Uint8Array(Buffer.from(value, "base64"));
}

export function encodePrepareResultsHeader(results: PrepareResult[]): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(results)));
}

export function decodePrepareResultsHeader(value: string): PrepareResult[] | null {
  try {
    const decoded = new TextDecoder().decode(base64ToBytes(value));
    const parsed = JSON.parse(decoded) as unknown;
    return Array.isArray(parsed) ? parsed as PrepareResult[] : null;
  } catch {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed as PrepareResult[] : null;
    } catch {
      return null;
    }
  }
}
