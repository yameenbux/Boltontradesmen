import { describe, it, expect, vi } from "vitest";
import { deleteExpiredProofFiles, PROOF_RETENTION_MONTHS } from "@/lib/proof-retention";

type Row = { id: string; storage_path: string };

function deps(batches: Row[][], opts: { removeError?: unknown; mark?: (ids: string[]) => number } = {}) {
  const calls: string[] = [];
  const queue = [...batches];
  return {
    calls,
    due: vi.fn(async (limit: number) => {
      calls.push(`due:${limit}`);
      return queue.shift() ?? [];
    }),
    remove: vi.fn(async (paths: string[]) => {
      calls.push(`remove:${paths.join("|")}`);
      return { error: opts.removeError ?? null };
    }),
    mark: vi.fn(async (ids: string[]) => {
      calls.push(`mark:${ids.join("|")}`);
      return opts.mark ? opts.mark(ids) : ids.length;
    }),
  };
}

describe("deleteExpiredProofFiles (owner decision: 12 months after the check)", () => {
  it("keeps proof files for 12 months", () => {
    expect(PROOF_RETENTION_MONTHS).toBe(12);
  });

  it("does nothing when nothing is due", async () => {
    const d = deps([[]]);
    expect(await deleteExpiredProofFiles(d, 2)).toBe(0);
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.mark).not.toHaveBeenCalled();
  });

  it("deletes each batch's files from Storage first, then marks those rows, until a short batch", async () => {
    const d = deps([
      [
        { id: "a", storage_path: "r1/a.jpg" },
        { id: "b", storage_path: "r2/b.pdf" },
      ],
      [{ id: "c", storage_path: "r3/c.png" }],
    ]);
    expect(await deleteExpiredProofFiles(d, 2)).toBe(3);
    expect(d.calls).toEqual(["due:2", "remove:r1/a.jpg|r2/b.pdf", "mark:a|b", "due:2", "remove:r3/c.png", "mark:c"]);
  });

  it("marks nothing when Storage refuses, so the files are tried again next time", async () => {
    const d = deps([[{ id: "a", storage_path: "r1/a.jpg" }]], { removeError: { message: "storage down" } });
    await expect(deleteExpiredProofFiles(d, 2)).rejects.toThrow(/storage down/);
    expect(d.mark).not.toHaveBeenCalled();
  });

  it("stops rather than loop if a full batch can't be marked", async () => {
    const d = deps(
      [
        [
          { id: "a", storage_path: "r1/a.jpg" },
          { id: "b", storage_path: "r2/b.jpg" },
        ],
        [
          { id: "a", storage_path: "r1/a.jpg" },
          { id: "b", storage_path: "r2/b.jpg" },
        ],
      ],
      { mark: () => 0 },
    );
    await expect(deleteExpiredProofFiles(d, 2)).rejects.toThrow(/marked/);
    expect(d.due).toHaveBeenCalledTimes(1);
  });
});
