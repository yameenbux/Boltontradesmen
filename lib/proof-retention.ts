// Proof files (photos and PDFs sent with reviews) are deleted from Storage 12 months after the admin checks them
// (settings.proof_retention_months; the privacy notice says so). The proof row and its outcome stay, so a
// Verified job stays verified; the row is marked file_deleted_at. Run from the admin Proofs page until Plan 5
// adds scheduled jobs.

export const PROOF_RETENTION_MONTHS = 12;

export type ProofRetentionDeps = {
  /** proof_files_due: checked over the retention period ago, file still stored. */
  due(limit: number): Promise<{ id: string; storage_path: string }[]>;
  /** Deletes the files from the private bucket. */
  remove(paths: string[]): Promise<{ error: unknown }>;
  /** mark_proof_files_deleted: returns how many rows it marked. */
  mark(ids: string[]): Promise<number>;
};

/**
 * Deletes due proof files a batch at a time: Storage first, then the rows are marked, so a failed delete is
 * simply tried again next time (deleting a file that is already gone is not an error). Returns how many were done.
 */
export async function deleteExpiredProofFiles(deps: ProofRetentionDeps, batch = 100): Promise<number> {
  let done = 0;
  for (;;) {
    const rows = await deps.due(batch);
    if (rows.length === 0) break;
    const { error } = await deps.remove(rows.map((r) => r.storage_path));
    if (error) {
      const message = (error as { message?: unknown }).message;
      throw new Error(`proof file delete failed: ${typeof message === "string" ? message : String(error)}`);
    }
    const marked = await deps.mark(rows.map((r) => r.id));
    if (marked === 0) throw new Error("proof files deleted but none could be marked");
    done += marked;
    if (rows.length < batch) break;
  }
  return done;
}
