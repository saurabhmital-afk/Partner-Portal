"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invoice {
  "Vendor Name": string;
  "Supplier Type": string;
  "Contract Value": string;
  "Budget Approved": string;
  "PO Number": string;
  "PO Status": string;
  "PO Date": string;
  "Invoice Status": string;
  "Invoice Number": string;
  "Invoice date": string;
  "Payment Status": string;
  "Balance": string;
  "Vendor Contact Info": string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const WEBHOOK_URL =
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
  "https://YOUR_N8N_INSTANCE/webhook/get-invoices";

const POLL_INTERVAL_MS = 60_000; // 60 seconds

// ─── Badge helpers ────────────────────────────────────────────────────────────

function invoiceStatusBadge(status: string) {
  const s = status?.toLowerCase();
  if (s === "overdue")
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-600/20">
        Overdue
      </span>
    );
  if (s === "paid")
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-600/20">
        Paid
      </span>
    );
  if (s === "pending")
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700 ring-1 ring-yellow-600/20">
        Pending
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
      {status || "—"}
    </span>
  );
}

function poStatusBadge(status: string) {
  const s = status?.toLowerCase();
  if (s === "approved")
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20">
        Approved
      </span>
    );
  if (s === "rejected")
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
      {status || "—"}
    </span>
  );
}

function paymentStatusBadge(status: string) {
  const s = status?.toLowerCase();
  if (s === "paid")
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-600/20">
        Paid
      </span>
    );
  if (s === "overdue" || s === "unpaid")
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        {status}
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
      {status || "—"}
    </span>
  );
}

function formatCurrency(value: string) {
  const num = parseFloat(value?.replace(/[^0-9.-]/g, ""));
  if (isNaN(num)) return value || "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(num);
}

function formatTimestamp(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvoiceDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const fetchInvoices = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(WEBHOOK_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Invoice[] = await res.json();
      setInvoices(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch invoice data."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Auto-poll every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchInvoices(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchInvoices]);

  // ── Filter & search ──────────────────────────────────────────────────────────

  const filtered = invoices.filter((inv) => {
    const matchesStatus =
      statusFilter === "All" ||
      inv["Invoice Status"]?.toLowerCase() === statusFilter.toLowerCase();

    const searchLower = search.toLowerCase();
    const matchesSearch =
      !search ||
      inv["Vendor Name"]?.toLowerCase().includes(searchLower) ||
      inv["Invoice Number"]?.toLowerCase().includes(searchLower) ||
      inv["PO Number"]?.toLowerCase().includes(searchLower) ||
      inv["Vendor Contact Info"]?.toLowerCase().includes(searchLower);

    return matchesStatus && matchesSearch;
  });

  const overdueCnt = invoices.filter(
    (i) => i["Invoice Status"]?.toLowerCase() === "overdue"
  ).length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Invoice Dashboard
          </h1>
          {lastUpdated && (
            <p className="mt-0.5 text-sm text-gray-500">
              Last updated: {formatTimestamp(lastUpdated)}
              {refreshing && (
                <span className="ml-2 text-blue-500">Refreshing…</span>
              )}
            </p>
          )}
        </div>

        {/* Summary pills */}
        <div className="flex gap-3">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{invoices.length}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          {overdueCnt > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-center shadow-sm">
              <p className="text-2xl font-bold text-red-600">{overdueCnt}</p>
              <p className="text-xs text-red-500">Overdue</p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Search vendor, invoice no., PO, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:max-w-xs"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="All">All Statuses</option>
          <option value="Overdue">Overdue</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
        </select>

        <button
          onClick={() => fetchInvoices(true)}
          disabled={refreshing}
          className="ml-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="flex h-48 items-center justify-center text-gray-500">
          Loading invoices…
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
          <button
            onClick={() => fetchInvoices(true)}
            className="ml-3 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Vendor Name",
                  "Supplier Type",
                  "Contract Value",
                  "Budget Approved",
                  "PO Number",
                  "PO Status",
                  "PO Date",
                  "Invoice Number",
                  "Invoice Date",
                  "Invoice Status",
                  "Payment Status",
                  "Balance",
                  "Contact",
                ].map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="py-12 text-center text-gray-400"
                  >
                    No invoices match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((inv, idx) => {
                  const isOverdue =
                    inv["Invoice Status"]?.toLowerCase() === "overdue";
                  return (
                    <tr
                      key={idx}
                      className={
                        isOverdue
                          ? "bg-red-50 hover:bg-red-100"
                          : "hover:bg-gray-50"
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                        {inv["Vendor Name"] || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {inv["Supplier Type"] || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {formatCurrency(inv["Contract Value"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {formatCurrency(inv["Budget Approved"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                        {inv["PO Number"] || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {poStatusBadge(inv["PO Status"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {inv["PO Date"] || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                        {inv["Invoice Number"] || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {inv["Invoice date"] || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {invoiceStatusBadge(inv["Invoice Status"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {paymentStatusBadge(inv["Payment Status"])}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 font-semibold ${
                          isOverdue ? "text-red-600" : "text-gray-900"
                        }`}
                      >
                        {formatCurrency(inv["Balance"])}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                        {inv["Vendor Contact Info"] ? (
                          <a
                            href={`mailto:${inv["Vendor Contact Info"]}`}
                            className="text-blue-600 hover:underline"
                          >
                            {inv["Vendor Contact Info"]}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400">
            Showing {filtered.length} of {invoices.length} invoices · Auto-refreshes every 60 seconds
          </div>
        </div>
      )}
    </div>
  );
}
