"use client";
import Link from "next/link";
import React, { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { financialRequest } from "@/lib/finance-api";
import { FinanceTable, Status } from "@/components/FinanceWorkspace";
import { Button } from "@/components/ui/Button";
interface Component {
  sourceId: string;
  sourceVersion: number;
  siteId: string;
  date: string;
  rate: string;
  units: string;
  base: string;
  overtime: string;
  gross: string;
}
interface Item {
  id: string;
  workerId: string;
  workerName: string;
  workerCode: string;
  gross: string;
  bonus: string;
  deductions: string;
  recovery: string;
  net: string;
  paid: string;
  outstanding: string;
  status: string;
  components: Component[];
  adjustments: { id: string; type: string; amount: string; reason: string }[];
}
interface Payroll {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  items: Item[];
  sourceChanges: string[];
  policy: { input: Record<string, unknown> };
  audit: { id: string; action: string; actorId: string; createdAt: string }[];
}
export default function PayrollDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const client = useQueryClient();
  const allowed = !!user && ["OWNER", "ACCOUNTANT"].includes(user.role);
  const detail = useQuery({
    queryKey: ["finance", "payroll", id],
    queryFn: () => api.get<Payroll>(`/finance/payroll/${id}`),
    enabled: allowed,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const key = useRef<{ path: string; body: string; key: string } | null>(null);
  const p = detail.data?.data;
  async function action(name: string) {
    if (!p) return;
    let body: unknown = {};
    if (["cancel", "return-to-draft"].includes(name)) {
      const reason = window.prompt("Reason (at least 5 characters):");
      if (!reason || reason.trim().length < 5) return;
      body = { reason };
    } else if (name === "recalculate") body = p.policy.input;
    else if (
      !window.confirm(
        `${name.charAt(0).toUpperCase() + name.slice(1)} this payroll? ${name === "finalize" ? "This freezes the financial snapshot and applies advance recoveries." : ""}`,
      )
    )
      return;
    const path = `/payroll/${id}/${name}`;
    const serialized = JSON.stringify(body);
    if (key.current?.path !== path || key.current?.body !== serialized)
      key.current = { path, body: serialized, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await financialRequest(path, body, key.current.key);
      key.current = null;
      await client.invalidateQueries({ queryKey: ["finance"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payroll action failed");
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return <p className="p-8">Financial access restricted.</p>;
  if (detail.isLoading) return <p className="p-8">Loading payroll…</p>;
  const items =
    p?.items.filter((i) => !selected || i.workerId === selected) ?? [];
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Link
        className="text-sm text-amber-700 underline"
        href="/finance/payroll"
      >
        Back to payroll
      </Link>
      {(error || detail.error) && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
          {error || String(detail.error)}
        </p>
      )}
      {p && (
        <>
          <header className="space-y-2">
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <p className="text-sm text-slate-500">
              {p.startDate.slice(0, 10)} to {p.endDate.slice(0, 10)}
            </p>
            <Status value={p.status} />
          </header>
          {p.sourceChanges.length > 0 && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              Attendance has changed since this snapshot. Finalized amounts
              remain frozen. An owner must authorize a supplemental correction
              in Wage settings. Source IDs: {p.sourceChanges.join(", ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {p.status === "DRAFT" && (
              <>
                <Button disabled={busy} onClick={() => action("recalculate")}>
                  Recalculate draft
                </Button>
                <Button disabled={busy} onClick={() => action("submit")}>
                  Submit for approval
                </Button>
              </>
            )}
            {p.status === "PENDING_APPROVAL" && (
              <Button disabled={busy} onClick={() => action("approve")}>
                Approve payroll
              </Button>
            )}
            {p.status === "APPROVED" && user?.role === "OWNER" && (
              <Button disabled={busy} onClick={() => action("finalize")}>
                Finalize snapshot
              </Button>
            )}
            {["PENDING_APPROVAL", "APPROVED"].includes(p.status) &&
              user?.role === "OWNER" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => action("return-to-draft")}
                >
                  Return to draft
                </Button>
              )}
            {!["FINALIZED", "CANCELLED"].includes(p.status) &&
              user?.role === "OWNER" && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => action("cancel")}
                >
                  Cancel payroll
                </Button>
              )}
            {p.status === "FINALIZED" && (
              <Link
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white"
                href="/finance/payments"
              >
                Record worker payment
              </Link>
            )}
          </div>
          <label className="block text-sm font-medium">
            Worker details
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="ml-3 rounded-lg border border-slate-300 bg-white p-2"
            >
              <option value="">All workers</option>
              {p.items.map((i) => (
                <option key={i.id} value={i.workerId}>
                  {i.workerCode} — {i.workerName}
                </option>
              ))}
            </select>
          </label>
          <FinanceTable
            columns={[
              "Worker",
              "Gross",
              "Bonus",
              "Deduction",
              "Recovery",
              "Net",
              "Paid",
              "Outstanding",
              "Settlement",
            ]}
            rows={items.map((i) => [
              `${i.workerCode} · ${i.workerName}`,
              i.gross,
              i.bonus,
              i.deductions,
              i.recovery,
              i.net,
              i.paid,
              i.outstanding,
              <Status key="s" value={i.status} />,
            ])}
          />
          {items.map((i) => (
            <section key={i.id} className="space-y-3">
              <h2 className="font-semibold">
                {i.workerName} — attendance and rate snapshot
              </h2>
              <FinanceTable
                columns={[
                  "Date",
                  "Site ID",
                  "Rate",
                  "Units",
                  "Base",
                  "Overtime",
                  "Gross",
                  "Attendance ID / version",
                ]}
                rows={i.components.map((c) => [
                  c.date,
                  c.siteId,
                  c.rate,
                  c.units,
                  c.base,
                  c.overtime,
                  c.gross,
                  `${c.sourceId} / ${c.sourceVersion}`,
                ])}
              />
              {i.adjustments.length > 0 && (
                <FinanceTable
                  columns={["Adjustment", "Amount", "Reason"]}
                  rows={i.adjustments.map((a) => [a.type, a.amount, a.reason])}
                />
              )}
            </section>
          ))}
          <section className="space-y-3">
            <h2 className="font-semibold">Payroll audit history</h2>
            <FinanceTable
              columns={["Date", "Action", "User"]}
              rows={p.audit.map((a) => [
                new Date(a.createdAt).toLocaleString(),
                a.action,
                a.actorId,
              ])}
            />
          </section>
        </>
      )}
    </div>
  );
}
