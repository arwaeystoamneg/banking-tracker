import { upload } from "@vercel/blob/client";
import {
  EVIDENCE_BLOB_ACCESS,
  EVIDENCE_JPEG_QUALITY,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_EDGE_PX,
} from "@/lib/blob/constants";
import { fitWithin, sha256Hex } from "@/lib/blob/image";

export interface PreparedEvidence {
  blob: Blob;
  content_hash: string;
  byte_size: number;
  mime: string;
  width: number;
  height: number;
}

export interface UploadedEvidence extends Omit<PreparedEvidence, "blob"> {
  blob_key: string;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number, maxBytes: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const tryQuality = (q: number) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not encode the photo"));
            return;
          }
          if (blob.size <= maxBytes || q <= 0.4) {
            resolve(blob);
            return;
          }
          tryQuality(Math.max(0.4, q - 0.15));
        },
        "image/jpeg",
        q,
      );
    };
    tryQuality(quality);
  });
}

/**
 * Downscale to the long-edge cap, then hash the bytes that will actually be stored.
 * Hashing after the resize is what lets a reviewer prove the file in the blob store
 * is the file that was submitted.
 */
export async function prepareEvidenceFile(file: File): Promise<PreparedEvidence> {
  const bitmap = await createImageBitmap(file);
  try {
    const sized = fitWithin(bitmap.width, bitmap.height, EVIDENCE_MAX_EDGE_PX);
    const canvas = document.createElement("canvas");
    canvas.width = sized.width;
    canvas.height = sized.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw the photo");
    ctx.drawImage(bitmap, 0, 0, sized.width, sized.height);

    const blob = await canvasToJpeg(canvas, EVIDENCE_JPEG_QUALITY, EVIDENCE_MAX_BYTES);
    const bytes = await blob.arrayBuffer();
    return {
      blob,
      content_hash: await sha256Hex(bytes),
      byte_size: bytes.byteLength,
      mime: "image/jpeg",
      width: sized.width,
      height: sized.height,
    };
  } finally {
    bitmap.close();
  }
}

function evidencePathname(lossId: string, fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "photo";
  return `loss-evidence/${lossId}/${stem}.jpg`;
}

/**
 * Copy the input File's bytes immediately. Some browsers (Safari especially) detach the original
 * once the file input is cleared, which is why previews can work and submit-time upload then fail.
 */
export async function snapshotFile(file: File): Promise<File> {
  const bytes = await file.arrayBuffer();
  return new File([bytes], file.name, { type: file.type || "image/jpeg", lastModified: file.lastModified });
}

/**
 * Client-direct upload with a server-issued token. The row is written by the caller after this
 * resolves — `onUploadCompleted` never fires on localhost, so we do not put row-writing there.
 */
export async function uploadPreparedEvidence(
  lossId: string,
  prepared: PreparedEvidence,
  fileName: string,
): Promise<UploadedEvidence> {
  const result = await upload(evidencePathname(lossId, fileName), prepared.blob, {
    access: EVIDENCE_BLOB_ACCESS,
    handleUploadUrl: "/api/evidence/upload",
    clientPayload: JSON.stringify({ loss_id: lossId }),
    contentType: prepared.mime,
  });
  return {
    blob_key: result.pathname,
    content_hash: prepared.content_hash,
    byte_size: prepared.byte_size,
    mime: prepared.mime,
    width: prepared.width,
    height: prepared.height,
  };
}

export async function uploadEvidenceFile(lossId: string, file: File): Promise<UploadedEvidence> {
  const prepared = await prepareEvidenceFile(await snapshotFile(file));
  return uploadPreparedEvidence(lossId, prepared, file.name);
}
