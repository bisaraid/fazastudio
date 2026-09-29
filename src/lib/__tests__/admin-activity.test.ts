import { test, expect, describe } from "vitest";
import {
  ACTION_LABEL,
  auditToItem,
  describeAuditDetail,
  mergeActivity,
  projectToItem,
  type AuditLogRow,
  type ProjectRow,
} from "@/lib/admin-activity";

const audit = (over: Partial<AuditLogRow> = {}): AuditLogRow => ({
  id: "a1",
  action: "set_plan",
  subject_email: "bu***@x.com",
  payload: { plan: "pro", previousPlan: "free" },
  created_at: "2026-01-15T10:00:00.000Z",
  ...over,
});

const project = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "p1",
  title: "Resep Seblak",
  created_at: "2026-01-15T09:00:00.000Z",
  ...over,
});

describe("auditToItem", () => {
  test("aksi dikenal pakai label ramah", () => {
    const it = auditToItem(audit());
    expect(it?.title).toBe(ACTION_LABEL.set_plan);
    expect(it?.kind).toBe("audit");
    expect(it?.id).toBe("audit:a1");
  });

  test("aksi tak dikenal ditampilkan apa adanya", () => {
    expect(auditToItem(audit({ action: "aksi_baru" }))?.title).toBe("aksi_baru");
  });

  test("created_at tidak valid -> null (tidak ditampilkan)", () => {
    expect(auditToItem(audit({ created_at: null }))).toBeNull();
    expect(auditToItem(audit({ created_at: "xxx" }))).toBeNull();
  });
});

describe("describeAuditDetail", () => {
  test("email + perubahan plan", () => {
    expect(describeAuditDetail(audit())).toBe("bu***@x.com — free → pro");
  });

  test("plan tanpa sebelumnya", () => {
    expect(describeAuditDetail(audit({ payload: { plan: "starter" } }))).toBe(
      "bu***@x.com — plan starter"
    );
  });

  test("flag admin & jumlah item", () => {
    expect(describeAuditDetail(audit({ subject_email: null, payload: { isAdmin: true } }))).toBe(
      "jadikan admin"
    );
    expect(describeAuditDetail(audit({ subject_email: null, payload: { isAdmin: false } }))).toBe(
      "cabut admin"
    );
    expect(describeAuditDetail(audit({ subject_email: null, payload: { count: 12 } }))).toBe("12 item");
  });

  test("payload kosong & tanpa subjek -> undefined", () => {
    expect(describeAuditDetail(audit({ subject_email: null, payload: null }))).toBeUndefined();
    expect(describeAuditDetail(audit({ subject_email: null, payload: {} }))).toBeUndefined();
  });
});

describe("projectToItem", () => {
  test("dengan judul", () => {
    const it = projectToItem(project());
    expect(it?.title).toBe("Project baru: Resep Seblak");
    expect(it?.kind).toBe("project");
  });

  test("tanpa judul / judul kosong", () => {
    expect(projectToItem(project({ title: null }))?.title).toBe("Project baru dibuat");
    expect(projectToItem(project({ title: "   " }))?.title).toBe("Project baru dibuat");
  });

  test("tanggal tidak valid -> null", () => {
    expect(projectToItem(project({ created_at: null }))).toBeNull();
  });
});

describe("mergeActivity", () => {
  test("menggabungkan audit + project, terbaru dulu", () => {
    const items = mergeActivity(
      [audit({ id: "a1", created_at: "2026-01-15T10:00:00.000Z" })],
      [project({ id: "p1", created_at: "2026-01-15T11:00:00.000Z" })]
    );
    expect(items.map((i) => i.id)).toEqual(["project:p1", "audit:a1"]);
  });

  test("maksimal sesuai limit (default 10)", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      audit({ id: `a${i}`, created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() })
    );
    expect(mergeActivity(many, [], 10)).toHaveLength(10);
    expect(mergeActivity(many, [])).toHaveLength(10);
    expect(mergeActivity(many, [], 3)).toHaveLength(3);
  });

  test("input null/kosong -> array kosong", () => {
    expect(mergeActivity(null, null)).toEqual([]);
    expect(mergeActivity([], [])).toEqual([]);
  });

  test("baris tanpa timestamp valid dibuang", () => {
    const items = mergeActivity(
      [audit({ id: "rusak", created_at: null })],
      [project({ id: "ok", created_at: "2026-01-15T09:00:00.000Z" })]
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("project:ok");
  });

  test("limit 0 -> kosong", () => {
    expect(mergeActivity([audit()], [project()], 0)).toEqual([]);
  });
});