"use client";

import { useState } from "react";
import { useLossEvidence } from "@/hooks/useLossEvidence";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { uploadEvidenceFile } from "@/lib/blob/upload";
import type { LossEvidence } from "@/lib/validation/schemas";

export function EvidenceGallery({
  lossId,
  evidence,
  canAttach,
}: {
  lossId: string;
  evidence: LossEvidence[];
  canAttach: boolean;
}) {
  const online = useOnlineStatus();
  const { create } = useLossEvidence(lossId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sorted = [...evidence].sort((a, b) => a.ordinal - b.ordinal);

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    if (!online) {
      setError("No connection. Photos can't upload — stay on this screen or try again once you have signal.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const start = sorted.length;
      const files = Array.from(list);
      for (let i = 0; i < files.length; i += 1) {
        const uploaded = await uploadEvidenceFile(lossId, files[i]);
        await create({
          loss_id: lossId,
          ordinal: start + i,
          kind: "photo",
          blob_key: uploaded.blob_key,
          content_hash: uploaded.content_hash,
          byte_size: uploaded.byte_size,
          mime: uploaded.mime,
          width: uploaded.width,
          height: uploaded.height,
          captured_at_exif: "",
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload photos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Evidence · {sorted.length} photo{sorted.length === 1 ? "" : "s"}
        </h2>
        {canAttach ? (
          <label className="text-sm font-medium text-emerald-400">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={busy || !online}
              className="sr-only"
              onChange={(e) => {
                const input = e.currentTarget;
                void onFiles(input.files).finally(() => {
                  input.value = "";
                });
              }}
            />
            {busy ? "Uploading…" : "Add photos"}
          </label>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-300">
          No photos on this report. Attestation only.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {sorted.map((row) => (
            <li key={row.evidence_id} className="overflow-hidden rounded-2xl border border-border bg-surface">
              {/* Authenticated private blob — next/image cannot send the session cookie. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/evidence/${row.evidence_id}/file`}
                alt=""
                className="max-h-[70vh] w-full object-contain bg-black"
              />
              <p className="px-3 py-2 text-[11px] text-muted">
                SHA-256 {row.content_hash.slice(0, 12)}… · {Math.round(row.byte_size / 1024)} KB
              </p>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {canAttach && !online ? (
        <p className="text-sm text-amber-300">No connection. Photos can&apos;t upload from here.</p>
      ) : null}
    </section>
  );
}
