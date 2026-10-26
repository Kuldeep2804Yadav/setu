'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getApiBaseUrl } from '@/lib/api';
import { formatDateDisplay } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Receipt,
  Download,
  Filter,
  DollarSign,
  Users2,
  Building2,
  Clock,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  Info,
} from 'lucide-react';

export default function WageRegisterPage() {
  const [siteFilter, setSiteFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Fetch Sites
  const { data: sitesData, isLoading: isSitesLoading } = useQuery({
    queryKey: ['sites-list'],
    queryFn: () => api.get<any[]>('/sites?limit=100'),
  });
  const sites: any[] = Array.isArray(sitesData?.data)
    ? sitesData.data
    : (sitesData?.data as any)?.sites || [];

  // Fetch Wage Register Data
  const { data: registerData, isLoading, error } = useQuery({
    queryKey: ['wage-register', siteFilter, workerFilter, startDate, endDate],
    queryFn: () => {
      const params: Record<string, any> = {};
      if (siteFilter) params.siteId = siteFilter;
      if (workerFilter) params.workerId = workerFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return api.get<any>('/wages/register', params);
    },
  });

  const totals = registerData?.data?.totals || {
    totalWorkers: 0,
    totalSites: 0,
    totalPresentUnits: 0,
    totalHoursWorked: 0,
    totalGrossWage: 0,
  };

  const entries = registerData?.data?.entries || [];

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);
      if (siteFilter) queryParams.append('siteId', siteFilter);
      if (workerFilter) queryParams.append('workerId', workerFilter);

      const API_BASE_URL = getApiBaseUrl();
      const response = await fetch(`${API_BASE_URL}/wages/register/export?${queryParams.toString()}`, {
        credentials: 'include',
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      });

      if (!response.ok) throw new Error('Failed to export CSV');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `wage-register-${startDate || 'all'}-to-${endDate || 'all'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Scope Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Receipt className="w-7 h-7 text-amber-500" />
            Wage Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Audited register of gross earned wages calculated from approved site attendance records and effective wage rates.
          </p>
        </div>

        <Button
          onClick={handleExportCsv}
          disabled={isExporting || entries.length === 0}
          className="gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shadow-sm"
        >
          <Download className="w-4 h-4" />
          {isExporting ? 'Exporting CSV...' : 'Export Register (CSV)'}
        </Button>
      </div>

      {/* Scope Restriction Notice Banner */}
      <div className="p-4 rounded-xl bg-slate-900 text-slate-200 text-xs flex items-start gap-3 shadow-sm border border-slate-800">
        <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold text-amber-400 uppercase tracking-wider block text-[11px] mb-0.5">
            Phase 2 Scope & Accounting Notice
          </span>
          This register records <span className="text-white font-semibold">gross earned wages</span> snapshots derived from approved site attendance. It represents earned amounts, <span className="underline decoration-amber-400 font-semibold text-white">not payments or disbursements</span>. Payouts, payroll disbursements, advances, statutory deductions (PF/ESIC), and banking transfers are reserved for future phases.
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 bg-white border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase">Total Gross Earned</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            ₹{Number(totals.totalGrossWage).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Approved earned wages</p>
        </Card>

        <Card className="p-4 bg-white border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase">Workers Active</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totals.totalWorkers}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Workers with earned wages</p>
        </Card>

        <Card className="p-4 bg-white border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase">Sites Active</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totals.totalSites}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Sites with recorded attendance</p>
        </Card>

        <Card className="p-4 bg-white border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase">Days / Units</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {Number(totals.totalPresentUnits).toFixed(1)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Payable daily units</p>
        </Card>

        <Card className="p-4 bg-white border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase">Hourly Hours</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {Number(totals.totalHoursWorked).toFixed(2)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Approved hourly shifts</p>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter by Site</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Construction Sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSiteFilter('');
                setStartDate('');
                setEndDate('');
              }}
              className="w-full h-9 text-xs border-slate-300 text-slate-600"
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Wage Register Table */}
      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <Clock className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-medium">Loading wage register entries...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-3" />
            <p className="text-sm font-medium">Failed to load wage register</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">No approved wage entries found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              Wage register records are automatically generated when an Organization Owner or Accountant approves a site attendance submission.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Attendance Date</th>
                  <th className="px-6 py-3.5 font-semibold">Worker Details</th>
                  <th className="px-6 py-3.5 font-semibold">Site Details</th>
                  <th className="px-6 py-3.5 font-semibold">Status & Units</th>
                  <th className="px-6 py-3.5 font-semibold">Applicable Rate</th>
                  <th className="px-6 py-3.5 font-semibold">Gross Earned Wage</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Approval Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-amber-50/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {formatDateDisplay(entry.attendanceDate)}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">{entry.attendanceDate}</span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{entry.workerName}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {entry.workerCode} • {entry.trade}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{entry.siteName}</div>
                      <div className="text-xs text-slate-400 font-mono">{entry.siteCode}</div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            entry.attendanceStatus === 'PRESENT'
                              ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                              : entry.attendanceStatus === 'HALF_DAY'
                              ? 'border-amber-300 text-amber-700 bg-amber-50'
                              : 'border-rose-300 text-rose-700 bg-rose-50'
                          }
                        >
                          {entry.attendanceStatus}
                        </Badge>
                        <span className="text-xs text-slate-600 font-medium">
                          {entry.wageType === 'HOURLY'
                            ? `${entry.hoursWorked || entry.payableUnits} hrs`
                            : `${entry.payableUnits} unit`}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs font-semibold text-slate-800">
                        ₹{Number(entry.rate).toFixed(2)}
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase">{entry.wageType}</span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-900">
                        ₹{Number(entry.grossWage).toFixed(2)}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right whitespace-nowrap text-xs text-slate-500">
                      <div>Approved by <span className="font-medium text-slate-800">{entry.approvedByName}</span></div>
                      <div className="text-[11px] text-slate-400">{formatDateDisplay(entry.approvedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
