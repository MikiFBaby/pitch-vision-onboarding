"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import type { Alert } from "@/types/dialedin-types";

interface AlertsPanelProps {
  alerts: (Alert & { dialedin_alert_rules?: { name: string; description: string | null } })[];
  loading?: boolean;
  onAcknowledge?: (alertId: string) => void;
}

export default function AlertsPanel({ alerts, loading, onAcknowledge }: AlertsPanelProps) {
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const handleAck = async (alertId: string) => {
    setAcknowledging(alertId);
    try {
      await fetch("/api/dialedin/alerts/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });
      onAcknowledge?.(alertId);
    } finally {
      setAcknowledging(null);
    }
  };

  if (loading) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <Bell size={18} /> Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] animate-pulse rounded-lg bg-white/[0.02]" />
        </CardContent>
      </Card>
    );
  }

  const unacked = alerts.filter((a) => !a.acknowledged);

  return (
    <Card className="bg-white/[0.03] border-white/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Bell size={18} /> Alerts
          {unacked.length > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
              {unacked.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-sm">
            <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400/40" />
            No alerts — all metrics within normal range
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border transition-colors ${
                  alert.acknowledged
                    ? "bg-white/[0.01] border-white/5 opacity-50"
                    : alert.severity === "critical"
                    ? "bg-red-500/5 border-red-500/20"
                    : "bg-amber-500/5 border-amber-500/20"
                }`}
              >
                <div className="flex items-start gap-2">
                  {alert.severity === "critical" ? (
                    <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-sm">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-white/30 text-xs flex items-center gap-1">
                        <Clock size={10} />
                        {alert.report_date}
                      </span>
                      {alert.agent_name && (
                        <span className="text-white/30 text-xs">{alert.agent_name}</span>
                      )}
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <button
                      onClick={() => handleAck(alert.id)}
                      disabled={acknowledging === alert.id}
                      className="text-xs text-white/40 hover:text-white/70 px-2 py-1 border border-white/10 rounded hover:bg-white/5 transition-colors shrink-0"
                    >
                      {acknowledging === alert.id ? "..." : "Ack"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
