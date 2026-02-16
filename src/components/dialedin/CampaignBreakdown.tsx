"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CampaignRow {
  campaign: string;
  campaign_type?: string;
  reps: number;
  man_hours: number;
  dialed?: number;
  dials_per_hr?: number;
  total_leads?: number;
  connects: number;
  contacts: number;
  transfers: number;
  hangups?: number;
  connect_pct: number;
  contact_pct?: number;
  conversion_rate_pct: number;
  drop_rate_pct: number;
  noans_rate_pct?: number;
  norb_rate_pct?: number;
  avg_wait_time_min: number;
  lines_per_agent?: number;
}

interface CampaignBreakdownProps {
  campaigns: CampaignRow[];
  aggregate?: {
    total_campaigns: number;
    total_system_connects: number;
    total_system_dials: number;
    total_hangups: number;
    total_leads: number;
    total_transfers: number;
    total_man_hours: number;
    avg_drop_rate: number;
    avg_connect_rate: number;
    avg_noans_rate: number;
    avg_norb_rate: number;
  };
  loading?: boolean;
}

export default function CampaignBreakdown({ campaigns, aggregate, loading }: CampaignBreakdownProps) {
  if (loading) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-lg">Campaign Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] animate-pulse rounded-lg bg-white/[0.02]" />
        </CardContent>
      </Card>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-lg">Campaign Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-white/30 text-sm">
            No campaign data — upload a CampaignSummary report
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalConnects = campaigns.reduce((s, c) => s + c.connects, 0);

  return (
    <Card className="bg-white/[0.03] border-white/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg">Campaign Breakdown</CardTitle>
          <div className="flex items-center gap-4">
            {aggregate && (
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span>{aggregate.total_system_dials.toLocaleString()} sys dials</span>
                <span>{aggregate.total_system_connects.toLocaleString()} sys connects</span>
                <span>{aggregate.total_hangups.toLocaleString()} hangups</span>
              </div>
            )}
            <span className="text-white/40 text-xs">{campaigns.length} campaigns</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs border-b border-white/5">
                <th className="text-left py-2 pr-4 font-medium">Campaign</th>
                <th className="text-right py-2 px-2 font-medium">Type</th>
                <th className="text-right py-2 px-2 font-medium">Reps</th>
                <th className="text-right py-2 px-2 font-medium">Dialed</th>
                <th className="text-right py-2 px-2 font-medium">Connects</th>
                <th className="text-right py-2 px-2 font-medium">Transfers</th>
                <th className="text-right py-2 px-2 font-medium">Hangups</th>
                <th className="text-right py-2 px-2 font-medium">Conn%</th>
                <th className="text-right py-2 px-2 font-medium">Conv%</th>
                <th className="text-right py-2 pl-2 font-medium">Drop%</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => {
                const pct = totalConnects > 0 ? (c.connects / totalConnects) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded-full bg-indigo-500/60"
                          style={{ width: `${Math.max(pct, 2)}%`, maxWidth: "60px" }}
                        />
                        <span className="text-white/70 truncate max-w-[180px]">{c.campaign}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 text-white/30 text-xs">{c.campaign_type || "—"}</td>
                    <td className="text-right py-2 px-2 text-white/50">{c.reps}</td>
                    <td className="text-right py-2 px-2 text-white/50">{(c.dialed || 0).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-white/80 font-medium">{c.connects.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-white/80 font-medium">{c.transfers}</td>
                    <td className="text-right py-2 px-2 text-white/40">{c.hangups || 0}</td>
                    <td className="text-right py-2 px-2 text-white/50">{c.connect_pct}%</td>
                    <td className="text-right py-2 px-2 text-white/50">{c.conversion_rate_pct}%</td>
                    <td className={`text-right py-2 pl-2 ${c.drop_rate_pct > 3 ? "text-red-400" : "text-white/40"}`}>
                      {c.drop_rate_pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
