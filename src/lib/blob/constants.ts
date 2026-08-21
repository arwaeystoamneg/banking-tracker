/**
 * Evidence blobs are private. These are photos of a casino floor and may have people in them;
 * the review page streams them through an authenticated route rather than rendering a public URL.
 */
export const EVIDENCE_BLOB_ACCESS = "private" as const;

/** Long-edge cap after downscale. Keeps a typical phone photo around ~300KB, well under 2MB. */
export const EVIDENCE_MAX_EDGE_PX = 1600;

/** Pinned on the upload token so a client that skips downscale still cannot land a huge file. */
export const EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;

export const EVIDENCE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const EVIDENCE_JPEG_QUALITY = 0.82;
