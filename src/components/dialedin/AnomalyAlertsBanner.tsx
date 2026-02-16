"use client";

import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { useState } from "react";
import type { Anomaly } from "@/types/dialedin-types";

interface AnomalyAlertsBannerProps {
  anomalies: Anomaly[];
}

const ANOMALY_LABELS: Record<string, string> = {
  zero_transfers: "Zero Transfers",
  high_dead_air: "High Dead Air",
  high_hung_up: "High Hung Up",
  low_tph: "Low TPH",
  outlier_dials: "Outlier Dials",
  stat_outlier: "Statistical Outlier",
};

export default function AnomalyAlertsBanner({ anomalies }: AnomalyAlertsBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (anomalies.length === 0 || dismissed) return null;

  const critical = anomalies.filter((a) => a.severity === "critical");
  const warnings = anomalies.filter((a) => a.severity === "warning");

  const bgColor = critical.length > 0
    ? "bg-red-500/10 border-red-500/20"
    : "bg-amber-500/10 border-amber-500/20";

  const Icon = critical.length > 0 ? AlertTriangle : AlertCircle;
  const iconColor = critical.length > 0 ? "text-red-400" : "text-amber-400";

  return (
    <div className={`relative rounded-xl border p-4 ${bgColor}`}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-white/30 hover:text-white/60"
      >
        <X size={14} />
      </button>

      <div className="flex items-start gap-3">
        <Icon size={20} className={`${iconColor} mt-0.5 shrink-0`} />
        <div className="space-y-1 flex-1">
          <p className="text-white/90 text-sm font-medium">
            {critical.length > 0
              ? `${critical.length} critical anomal${critical.length === 1 ? "y" : "ies"} detected`
              : `${warnings.length} warning${warnings.length === 1 ? "" : "s"} detected`}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {anomalies.slice(0, 8).map((a) => (
              <span
                key={a.id}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${
                  a.severity === "critical"
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {a.severity === "critical" ? (
                  <AlertTriangle size={10} />
                ) : (
                  <Info size={10} />
                )}
                {a.agent_name ? `${a.agent_name}: ` : ""}
                {ANOMALY_LABELS[a.anomaly_type] || a.anomaly_type}
                {a.metric_value !== null && ` (${a.metric_value})`}
              </span>
            ))}
            {anomalies.length > 8 && (
              <span className="text-white/30 text-xs self-center">
                +{anomalies.length - 8} more
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
