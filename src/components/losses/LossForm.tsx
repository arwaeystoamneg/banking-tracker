"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLossReports } from "@/hooks/useLossReports";
import { useLossEvidence } from "@/hooks/useLossEvidence";
import { canonicalCasino, KNOWN_CASINO_NAMES } from "@/lib/names";
import { dateTimeLocalToIso, toDateTimeLocalValue } from "@/lib/dates";
import { makeId } from "@/lib/ids";
import {
  prepareEvidenceFile,
  snapshotFile,
  uploadPreparedEvidence,
  type PreparedEvidence,
} from "@/lib/blob/upload";
import type { Session } from "@/lib/validation/schemas";

const OFFLINE_MESSAGE =
  "No connection. Photos can't upload — stay on this screen or re-submit once you have signal.";

interface PendingPhoto {
  id: string;
  name: string;
  previewUrl: string;
  prepared: PreparedEvidence;
}

export function LossForm({ session }: { session?: Session }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { create } = useLossReports();
  const { create: createEvidence } = useLossEvidence();

  const [amount, setAmount] = useState(() =>
    session?.gross_wl !== null && session?.gross_wl !== undefined && session.gross_wl < 0
      ? String(Math.abs(session.gross_wl))
      : "",
  );
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocalValue());
  const [casino, setCasino] = useState(() => session?.casino ?? "");
  const [tableNo, setTableNo] = useState("");
  const [circumstances, setCircumstances] = useState("");
  const [witnessName, setWitnessName] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const copies = Array.from(list).map((file) => snapshotFile(file));
    setPreparing(true);
    setError("");
    try {
      const snapshots = await Promise.all(copies);
      const added: PendingPhoto[] = [];
      for (const snapshot of snapshots) {
        const prepared = await prepareEvidenceFile(snapshot);
        added.push({
          id: crypto.randomUUID(),
          name: snapshot.name,
          previewUrl: URL.createObjectURL(prepared.blob),
          prepared,
        });
      }
      setPhotos((current) => [...current, ...added]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that photo.");
    } finally {
      setPreparing(false);
    }
  }

  function removeFile(id: string) {
    setPhotos((current) => {
      const next = current.filter((photo) => photo.id !== id);
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!online) {
      setError(OFFLINE_MESSAGE);
      return;
    }

    const amountValue = Number(amount);
    if (!casino.trim() || !occurredAt || !circumstances.trim() || !Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Amount, when it happened, casino, and what happened are required.");
      return;
    }

    setSubmitting(true);
    setError("");
    setProgress("Filing report…");

    const lossId = makeId("lossReport");
    let filed = false;
    try {
      await create(
        {
          session_id: session?.session_id ?? "",
          casino: canonicalCasino(casino),
          game_id: session?.game_id ?? "",
          table_no: tableNo.trim(),
          occurred_at: dateTimeLocalToIso(occurredAt),
          amount: amountValue,
          circumstances: circumstances.trim(),
          witness_name: witnessName.trim(),
        },
        lossId,
      );
      filed = true;
      setSavedId(lossId);

      for (let i = 0; i < photos.length; i += 1) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        const photo = photos[i];
        const uploaded = await uploadPreparedEvidence(lossId, photo.prepared, photo.name);
        await createEvidence({
          loss_id: lossId,
          ordinal: i,
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

      router.replace(`/losses/${lossId}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not file the report.";
      if (filed) {
        setError(`${message} The report text was saved — open it to add photos once uploads work.`);
      } else {
        setError(message);
      }
      setSubmitting(false);
      setProgress("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!online ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-300">
          {OFFLINE_MESSAGE}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Amount lost</span>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="0.00"
          required
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">When it happened</span>
        <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Casino</span>
        <Input
          value={casino}
          onChange={(e) => setCasino(e.target.value)}
          placeholder="Casino name"
          list="loss-casinos"
          required
        />
        <datalist id="loss-casinos">
          {KNOWN_CASINO_NAMES.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Table (optional)</span>
        <Input value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="Table number" />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">What happened</span>
        <textarea
          value={circumstances}
          onChange={(e) => setCircumstances(e.target.value)}
          placeholder="What you saw, how much walked, who was on the game"
          rows={5}
          required
          className="w-full resize-y rounded-xl border border-border bg-surface-inset px-3.5 py-3 text-base text-foreground outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Witness (optional)</span>
        <Input
          value={witnessName}
          onChange={(e) => setWitnessName(e.target.value)}
          placeholder="Name of someone who saw it"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted">Photos</legend>
        <p className="text-xs text-muted">
          If the floor bans phones, submit without photos and name a witness. Photos upload now — they
          are not queued for later.
        </p>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            const input = e.currentTarget;
            void onFiles(input.files).finally(() => {
              input.value = "";
            });
          }}
          className="block w-full text-sm text-muted file:mr-3 file:h-12 file:rounded-xl file:border file:border-border file:bg-surface-raised file:px-4 file:text-sm file:font-semibold file:text-foreground"
        />
        {preparing ? <p className="text-sm text-muted">Preparing photos…</p> : null}
        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <li key={photo.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="" className="h-24 w-full rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(photo.id)}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-xs text-white"
                  aria-label={`Remove ${photo.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {error && savedId ? (
        <Link href={`/losses/${savedId}`} className="block text-sm font-medium text-emerald-400">
          Open the saved report
        </Link>
      ) : null}
      {progress ? <p className="text-sm text-muted">{progress}</p> : null}

      <Button type="submit" disabled={submitting || preparing || !online} className="w-full">
        {submitting ? "Filing…" : "File loss report"}
      </Button>
    </form>
  );
}
