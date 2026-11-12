"use client";
import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { financialRequest, downloadFinance } from "@/lib/finance-api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";

type Section =
  | "dashboard"
  | "payroll"
  | "advances"
  | "payments"
  | "reports"
  | "site-cost"
  | "settings"
  | "workers";
interface Option {
  id: string;
  name: string;
  code?: string;
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
  paid?: string;
  outstanding?: string;
  status?: string;
}
interface Period {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  frequency: string;
  items: Item[];
}
interface Transaction {
  id: string;
  workerId: string;
  siteId?: string;
  amount: string;
  date: string;
  method: string;
  reference: string;
  status: string;
  confirmation?: string;
  outstanding?: string;
  recovered?: string;
  reserved?: string;
  availableRecovery?: string;
}
interface Settings {
  periodAbsenceRule: "UNPAID" | "PAID";
  paidLeave: boolean;
  monthlyDivisor: string;
  weeklyDivisor: string;
  paidLeaveHours: string;
  accountantCanApprove: boolean;
}
interface Report {
  company: string;
  title: string;
  period: string;
  currency: string;
  columns: string[];
  rows: string[][];
  totals: Record<string, string>;
  notice: string;
}
interface Preview {
  items: Item[];
  input: Record<string, unknown>;
}
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const sections: Section[] = [
  "dashboard",
  "payroll",
  "advances",
  "payments",
  "reports",
  "site-cost",
  "settings",
  "workers",
];
const titles: Record<Section, string> = {
  dashboard: "Payroll dashboard",
  payroll: "Generate & review payroll",
  advances: "Worker advances",
  payments: "Worker payments",
  reports: "Financial reports",
  "site-cost": "Site labour costs",
  settings: "Wage settings",
  workers: "Worker wage statement",
};
const reportNames: Record<string, string> = {
  "daily-cost": "Daily labour cost",
  "weekly-wages": "Weekly wages",
  "monthly-payroll": "Monthly payroll",
  "worker-statement": "Worker wage statement",
  advances: "Worker advances",
  "pending-payments": "Pending payments",
  "payment-history": "Payment history",
  "site-cost": "Site labour cost",
};
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm font-medium text-slate-600">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${["FINALIZED", "CONFIRMED", "PAID"].includes(value) ? "bg-emerald-100 text-emerald-800" : ["REVERSED", "CANCELLED"].includes(value) ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function FinanceTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-600">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-4 py-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {r.map((v, j) => (
                  <td key={j} className="px-4 py-3 align-top">
                    {v}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="p-8 text-center text-slate-500"
              >
                No records match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function FinanceWorkspace({
  section = "dashboard",
}: {
  section?: Section;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const allowed = !!user && ["OWNER", "ACCOUNTANT"].includes(user.role);
  const owner = user?.role === "OWNER";
  const [workerId, setWorker] = useState("");
  const [siteId, setSite] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reportKind, setReportKind] = useState(
    section === "workers"
      ? "worker-statement"
      : section === "site-cost"
        ? "site-cost"
        : "monthly-payroll",
  );
  const [recoveryRows, setRecoveries] = useState<
    { advanceId: string; amount: string }[]
  >([]);
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const requestKey = useRef<{ payload: string; key: string } | null>(null);
  const filters = { workerId, siteId, startDate, endDate };
  const effectiveReportKind = ["dashboard", "site-cost"].includes(section)
    ? "site-cost"
    : reportKind;
  const workers = useQuery({
    queryKey: ["finance", "workers"],
    queryFn: () => api.get<Option[]>("/workers", { limit: 100 }),
    enabled: allowed,
  });
  const sites = useQuery({
    queryKey: ["finance", "sites"],
    queryFn: () => api.get<Option[]>("/sites", { limit: 100 }),
    enabled: allowed,
  });
  const settings = useQuery({
    queryKey: ["finance", "settings"],
    queryFn: () => api.get<Settings>("/finance/settings"),
    enabled: allowed,
  });
  const report = useQuery({
    queryKey: ["finance", "report", effectiveReportKind, filters],
    queryFn: () =>
      api.get<Report>(`/finance/reports/${effectiveReportKind}`, filters),
    enabled:
      allowed &&
      ["dashboard", "reports", "site-cost", "workers"].includes(section),
  });
  const collection =
    section === "payroll"
      ? "payroll"
      : section === "advances"
        ? "advances"
        : "payments";
  const list = useQuery({
    queryKey: ["finance", "list", collection, filters, page],
    queryFn: () =>
      api.get<(Period | Transaction)[]>(`/finance/${collection}`, {
        ...filters,
        page,
        limit: 20,
      }),
    enabled: allowed && ["payroll", "advances", "payments"].includes(section),
  });
  const periods = useQuery({
    queryKey: ["finance", "finalized", workerId],
    queryFn: () =>
      api.get<Period[]>("/finance/payroll", {
        status: "FINALIZED",
        workerId,
        limit: 100,
      }),
    enabled: allowed && section === "payments",
  });
  const advances = useQuery({
    queryKey: ["finance", "recoverable", workerId],
    queryFn: () =>
      api.get<Transaction[]>("/finance/advances", {
        status: "CONFIRMED",
        workerId,
        limit: 100,
      }),
    enabled: allowed && section === "payroll",
  });
  const rates = useQuery({
    queryKey: ["finance", "rates", workerId],
    queryFn: () =>
      api.get<
        {
          id: string;
          workerId: string;
          type: string;
          amount: string;
          effectiveFrom: string;
        }[]
      >("/finance/rates", { workerId, limit: 100 }),
    enabled: allowed && section === "settings",
  });
  const selectedSettings = settingsDraft ?? settings.data?.data;
  const workerName = (id: string) =>
    workers.data?.data.find((w) => w.id === id)?.name ?? id;
  async function command<T>(
    path: string,
    body: unknown,
    method = "POST",
  ): Promise<T | undefined> {
    setError("");
    setMessage("");
    setBusy(true);
    const payload = JSON.stringify({ path, body, method });
    if (requestKey.current?.payload !== payload)
      requestKey.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await financialRequest<T>(
        path,
        body,
        requestKey.current.key,
        method,
      );
      requestKey.current = null;
      await client.invalidateQueries({ queryKey: ["finance"] });
      setMessage("Saved successfully.");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function transactionAction(
    kind: string,
    row: Transaction,
    action: string,
  ) {
    if (action === "confirm") {
      if (
        !window.confirm(
          `Confirm that ${row.amount} was actually ${kind === "advances" ? "issued to" : "paid to"} the worker outside LabourSetu? This is manual confirmation, not bank verification.`,
        )
      )
        return;
      await command(`/${kind}/${row.id}/confirm`, { manuallyConfirmed: true });
    } else {
      const reason = window.prompt("Enter the reason (at least 5 characters):");
      if (reason && reason.trim().length >= 5)
        await command(`/${kind}/${row.id}/${action}`, { reason });
    }
  }
  async function download(format: "pdf" | "xlsx") {
    setError("");
    try {
      const params = new URLSearchParams(
        Object.entries({ ...filters, format }).filter(([, v]) => v),
      );
      await downloadFinance(
        `/reports/${["dashboard", "site-cost"].includes(section) ? "site-cost" : reportKind}?${params}`,
        `laboursetu-${reportKind}.${format}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }
  if (!allowed)
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Financial access restricted</h1>
        <p className="mt-2 text-slate-600">
          Payroll and payments are available to owners and accountants.
        </p>
      </div>
    );
  const loading = list.isLoading || report.isLoading;
  const queryError = [
    workers.error,
    sites.error,
    settings.error,
    list.error,
    report.error,
    periods.error,
    advances.error,
    rates.error,
  ].find(Boolean);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
          LabourSetu · Financial management
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {titles[section]}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Wages come from approved attendance. Payments happen outside
          LabourSetu and require manual confirmation.
        </p>
      </header>
      <nav aria-label="Financial sections" className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <a
            key={s}
            href={`/finance/${s}`}
            className={`rounded-lg px-3 py-2 text-sm ${s === section ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
          >
            {s === "site-cost"
              ? "Site costs"
              : s.charAt(0).toUpperCase() + s.slice(1)}
          </a>
        ))}
      </nav>
      {(error || queryError) && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error ||
            (queryError instanceof Error
              ? queryError.message
              : "Unable to load financial data.")}{" "}
          <button
            className="underline"
            onClick={() => client.invalidateQueries({ queryKey: ["finance"] })}
          >
            Retry
          </button>
        </div>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Worker">
          <select
            className={inputClass}
            value={workerId}
            onChange={(e) => {
              setWorker(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All workers</option>
            {workers.data?.data.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Site">
          <select
            className={inputClass}
            value={siteId}
            onChange={(e) => {
              setSite(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All sites</option>
            {sites.data?.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            className={inputClass}
            type="date"
            value={startDate}
            onChange={(e) => {
              setStart(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Through">
          <input
            className={inputClass}
            type="date"
            value={endDate}
            onChange={(e) => {
              setEnd(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      {loading && (
        <p role="status" className="text-slate-500">
          Loading financial records…
        </p>
      )}
      {["dashboard", "reports", "site-cost", "workers"].includes(section) && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(report.data?.data.totals ?? {}).map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <p className="text-sm text-slate-500">
                  {k.replace(/([A-Z])/g, " $1")}
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-slate-900">
                  {report.data?.data.currency} {v}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {["reports", "workers"].includes(section) && (
              <Field label="Report">
                <select
                  className={inputClass}
                  value={reportKind}
                  onChange={(e) => setReportKind(e.target.value)}
                >
                  {Object.entries(reportNames).map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Button variant="outline" onClick={() => download("pdf")}>
              Download PDF
            </Button>
            <Button variant="outline" onClick={() => download("xlsx")}>
              Download Excel
            </Button>
          </div>
          {report.data && (
            <>
              <p className="text-xs text-slate-500">
                {report.data.data.notice}
              </p>
              <FinanceTable
                columns={report.data.data.columns}
                rows={report.data.data.rows}
              />
            </>
          )}
        </>
      )}
      {section === "payroll" && (
        <>
          <form
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const body = {
                name: String(data.get("name")),
                frequency: String(data.get("frequency")),
                startDate,
                endDate,
                ...(workerId ? { workerId } : {}),
                ...(siteId ? { siteId } : {}),
                recoveries: recoveryRows,
              };
              const result = await command<Preview>("/payroll/preview", body);
              if (result) setPreview({ ...result, input: body });
            }}
          >
            <h2 className="font-semibold">Generate payroll</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payroll name">
                <input
                  name="name"
                  className={inputClass}
                  required
                  minLength={2}
                  placeholder="Weekly site payroll"
                />
              </Field>
              <Field label="Frequency">
                <select name="frequency" className={inputClass}>
                  <option>CUSTOM</option>
                  <option>WEEKLY</option>
                  <option>FORTNIGHTLY</option>
                  <option>MONTHLY</option>
                </select>
              </Field>
            </div>
            <p className="text-sm text-slate-500">
              Choose the period and optional worker/site above. Advance recovery
              is optional and requires confirmed issuance.
            </p>
            {recoveryRows.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <select
                  required
                  aria-label="Advance to recover"
                  className={`${inputClass} max-w-md`}
                  value={row.advanceId}
                  onChange={(e) =>
                    setRecoveries((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, advanceId: e.target.value } : r,
                      ),
                    )
                  }
                >
                  <option value="">Select confirmed advance</option>
                  {advances.data?.data.map((a) => (
                    <option key={a.id} value={a.id}>
                      {workerName(a.workerId)} · {a.reference} · available{" "}
                      {a.availableRecovery}
                    </option>
                  ))}
                </select>
                <input
                  required
                  aria-label="Recovery amount"
                  className={`${inputClass} max-w-40`}
                  value={row.amount}
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  placeholder="Amount"
                  onChange={(e) =>
                    setRecoveries((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, amount: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setRecoveries((rows) => rows.filter((_, j) => j !== i))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRecoveries((rows) => [
                    ...rows,
                    { advanceId: "", amount: "" },
                  ])
                }
              >
                Add recovery
              </Button>
              <Button disabled={!startDate || !endDate} isLoading={busy}>
                Preview payroll
              </Button>
            </div>
          </form>
          {preview && (
            <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold">Payroll preview</h2>
              <FinanceTable
                columns={[
                  "Worker",
                  "Gross",
                  "Bonus",
                  "Deductions",
                  "Advance recovery",
                  "Net",
                ]}
                rows={preview.items.map((i) => [
                  i.workerName,
                  i.gross,
                  i.bonus,
                  i.deductions,
                  i.recovery,
                  i.net,
                ])}
              />
              <Button
                isLoading={busy}
                onClick={async () => {
                  const result = await command<Period>(
                    "/payroll",
                    preview.input,
                  );
                  if (result) {
                    setPreview(null);
                    window.location.assign(`/finance/payroll/${result.id}`);
                  }
                }}
              >
                Save draft for review
              </Button>
            </section>
          )}
          <FinanceTable
            columns={["Payroll", "Period", "Frequency", "Approval", "Details"]}
            rows={((list.data?.data as Period[]) ?? []).map((p) => [
              p.name,
              `${p.startDate.slice(0, 10)} – ${p.endDate.slice(0, 10)}`,
              p.frequency,
              <Status key="s" value={p.status} />,
              <a
                key="a"
                className="text-amber-700 underline"
                href={`/finance/payroll/${p.id}`}
              >
                Review payroll
              </a>,
            ])}
          />
        </>
      )}
      {["advances", "payments"].includes(section) && (
        <>
          <form
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const values = Object.fromEntries(new FormData(form));
              const body =
                section === "advances"
                  ? { ...values, workerId, siteId }
                  : values;
              const result = await command(`/${section}`, body);
              if (result) form.reset();
            }}
          >
            <h2 className="font-semibold">
              {section === "advances"
                ? "Add pending advance"
                : "Record pending worker payment"}
            </h2>
            <p className="text-xs text-slate-500">
              {section === "advances"
                ? "Select worker and issuing site above."
                : "Only finalized payroll items can be paid. Select a worker above to narrow the list."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section === "payments" && (
                <Field label="Finalized worker payroll">
                  <select required name="payrollItemId" className={inputClass}>
                    <option value="">Select payroll item</option>
                    {periods.data?.data.flatMap((p) =>
                      p.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {p.name} · {i.workerName} · outstanding{" "}
                          {i.outstanding ?? i.net}
                        </option>
                      )),
                    )}
                  </select>
                </Field>
              )}
              <Field label="Amount">
                <input
                  required
                  name="amount"
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  className={inputClass}
                />
              </Field>
              <Field label="Actual payment date">
                <input
                  required
                  name="date"
                  type="date"
                  className={inputClass}
                />
              </Field>
              <Field label="Method">
                <select name="method" className={inputClass}>
                  <option>CASH</option>
                  <option>UPI</option>
                  <option>BANK_TRANSFER</option>
                </select>
              </Field>
              <Field label="Transaction / cash receipt reference">
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  name="reference"
                  className={inputClass}
                />
              </Field>
            </div>
            <Button
              isLoading={busy}
              disabled={section === "advances" && (!workerId || !siteId)}
            >
              Save pending record
            </Button>
          </form>
          <FinanceTable
            columns={[
              "Worker",
              "Date",
              "Amount",
              "Method / reference",
              "Status",
              ...(section === "advances"
                ? ["Recovered / reserved", "Outstanding"]
                : ["Confirmation"]),
              "Actions",
            ]}
            rows={((list.data?.data as Transaction[]) ?? []).map((row) => [
              workerName(row.workerId),
              row.date.slice(0, 10),
              row.amount,
              `${row.method} · ${row.reference}`,
              <Status key="s" value={row.status} />,
              ...(section === "advances"
                ? [`${row.recovered} / ${row.reserved}`, row.outstanding]
                : [row.confirmation]),
              <div key="actions" className="flex flex-wrap gap-2">
                {row.status === "PENDING" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => transactionAction(section, row, "confirm")}
                    >
                      Confirm manually
                    </Button>
                    {section === "payments" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          transactionAction(section, row, "cancel")
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </>
                )}
                {owner &&
                  (row.status === "CONFIRMED" ||
                    (section === "advances" && row.status === "PENDING")) && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => transactionAction(section, row, "reverse")}
                    >
                      Reverse
                    </Button>
                  )}
                {section === "payments" &&
                  ["CONFIRMED", "REVERSED"].includes(row.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await downloadFinance(
                            `/payments/${row.id}/receipt?format=pdf`,
                            `receipt-${row.id}.pdf`,
                          );
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      Receipt
                    </Button>
                  )}
              </div>,
            ])}
          />
        </>
      )}
      {section === "settings" && (
        <>
          {selectedSettings && (
            <form
              className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
              onSubmit={async (e) => {
                e.preventDefault();
                await command(
                  "/settings",
                  {
                    paidLeave: selectedSettings.paidLeave,
                    periodAbsenceRule: selectedSettings.periodAbsenceRule,
                    monthlyDivisor: selectedSettings.monthlyDivisor,
                    weeklyDivisor: selectedSettings.weeklyDivisor,
                    paidLeaveHours: selectedSettings.paidLeaveHours,
                    accountantCanApprove: selectedSettings.accountantCanApprove,
                  },
                  "PUT",
                );
              }}
            >
              <h2 className="font-semibold">Payment-period and leave rules</h2>
              <p className="text-sm text-slate-500">
                Weekly and monthly wages accrue only for approved payable
                attendance days, using the divisors below. Missing days earn
                zero; approved absences follow the selected rule. Calendar
                months use their actual day count.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Monthly divisor">
                  <input
                    disabled={!owner}
                    className={inputClass}
                    value={selectedSettings.monthlyDivisor}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...selectedSettings,
                        monthlyDivisor: e.target.value,
                      })
                    }
                  />
                  <span className="text-xs">
                    CALENDAR_MONTH or an integer from 1 to 31
                  </span>
                </Field>
                <Field label="Period-worker absence rule">
                  <select
                    disabled={!owner}
                    className={inputClass}
                    value={selectedSettings.periodAbsenceRule}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...selectedSettings,
                        periodAbsenceRule: e.target.value as "UNPAID" | "PAID",
                      })
                    }
                  >
                    <option value="UNPAID">Approved absences unpaid</option>
                    <option value="PAID">
                      Approved absences paid (weekly/monthly)
                    </option>
                  </select>
                </Field>
                <Field label="Weekly divisor">
                  <input
                    disabled={!owner}
                    className={inputClass}
                    value={selectedSettings.weeklyDivisor}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...selectedSettings,
                        weeklyDivisor: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Hourly paid-leave hours">
                  <input
                    disabled={!owner}
                    className={inputClass}
                    value={selectedSettings.paidLeaveHours}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...selectedSettings,
                        paidLeaveHours: e.target.value,
                      })
                    }
                  />
                </Field>
                <div className="space-y-3">
                  <label className="block text-sm">
                    <input
                      disabled={!owner}
                      type="checkbox"
                      checked={selectedSettings.paidLeave}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...selectedSettings,
                          paidLeave: e.target.checked,
                        })
                      }
                    />{" "}
                    Enable authorized paid leave
                  </label>
                  <label className="block text-sm">
                    <input
                      disabled={!owner}
                      type="checkbox"
                      checked={selectedSettings.accountantCanApprove}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...selectedSettings,
                          accountantCanApprove: e.target.checked,
                        })
                      }
                    />{" "}
                    Explicitly permit accountants to approve payroll
                  </label>
                </div>
              </div>
              {owner && <Button isLoading={busy}>Save settings</Button>}
            </form>
          )}
          {owner && (
            <>
              <SimpleFinanceForm
                title="Add exact historical wage rate"
                fields={[
                  [
                    "type",
                    "Wage type",
                    ["DAILY", "HOURLY", "WEEKLY", "MONTHLY"],
                  ],
                  ["amount", "Rate", "text"],
                  ["effectiveFrom", "Effective from", "date"],
                ]}
                submit={(values) =>
                  workerId
                    ? command("/rates", { ...values, workerId })
                    : Promise.resolve(setError("Select a worker first."))
                }
                busy={busy}
              />
              <SimpleFinanceForm
                title="Authorize bonus, deduction or supplemental correction"
                fields={[
                  ["date", "Adjustment date", "date"],
                  ["type", "Adjustment type", ["BONUS", "DEDUCTION"]],
                  ["amount", "Amount", "text"],
                  ["reason", "Authorization reason", "text"],
                  [
                    "correctsPayrollId",
                    "Corrected finalized payroll ID (optional)",
                    "optional",
                  ],
                ]}
                submit={(values) =>
                  workerId && siteId
                    ? command("/adjustments", { ...values, workerId, siteId })
                    : Promise.resolve(
                        setError("Select a worker and site first."),
                      )
                }
                busy={busy}
              />
              <SimpleFinanceForm
                title="Authorize overtime or paid leave on approved attendance"
                fields={[
                  ["attendanceId", "Approved attendance ID", "text"],
                  ["paidLeave", "Paid leave", ["false", "true"]],
                  ["overtimeHours", "Overtime hours (0 for leave)", "text"],
                  ["overtimeRate", "Overtime rate (0 for leave)", "text"],
                  ["reason", "Authorization reason", "text"],
                ]}
                submit={(values) =>
                  command("/work-supplements", {
                    ...values,
                    paidLeave: values.paidLeave === "true",
                  })
                }
                busy={busy}
              />
            </>
          )}
          <FinanceTable
            columns={["Worker", "Wage type", "Exact rate", "Effective from"]}
            rows={(rates.data?.data ?? []).map((r) => [
              workerName(r.workerId),
              r.type,
              r.amount,
              r.effectiveFrom.slice(0, 10),
            ])}
          />
        </>
      )}
      {["payroll", "advances", "payments"].includes(section) && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} · {list.data?.meta?.total ?? 0} records
          </span>
          <Button
            variant="outline"
            disabled={page * 20 >= (list.data?.meta?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
type FormField = [string, string, string | string[]];
function SimpleFinanceForm({
  title,
  fields,
  submit,
  busy,
}: {
  title: string;
  fields: FormField[];
  submit: (values: Record<string, string>) => Promise<unknown>;
  busy: boolean;
}) {
  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const values = Object.fromEntries(
          [...new FormData(form)].filter(([, v]) => v !== ""),
        ) as Record<string, string>;
        await submit(values);
      }}
    >
      <h2 className="font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([name, label, type]) => (
          <Field key={name} label={label}>
            {Array.isArray(type) ? (
              <select name={name} className={inputClass}>
                {type.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            ) : (
              <input
                name={name}
                type={type === "optional" ? "text" : type}
                required={type !== "optional"}
                className={inputClass}
              />
            )}
          </Field>
        ))}
      </div>
      <Button isLoading={busy}>Save authorized record</Button>
    </form>
  );
}
