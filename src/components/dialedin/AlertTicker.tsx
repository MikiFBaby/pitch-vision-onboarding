"use client";

import { AlertTriangle, AlertCircle, Info, Radio } from "lucide-react";
import type { Anomaly, Alert } from "@/types/dialedin-types";

interface LiveEvent {
  event_type: string;
  event_subtype: string | null;
  agent_name: string;
  campaign: string;
  event_timestamp: string;
}

interface AlertTickerProps {
  anomalies: Anomaly[];
  alerts: (Alert & { dialedin_alert_rules?: { name: string; description: string | null } })[];
  liveEvents?: LiveEvent[];
}

function formatLiveEvent(e: LiveEvent): string {
  const agent = e.agent_name || "Unknown";
  const campaign = e.campaign ? ` (${e.campaign})` : "";
  if (e.event_type === "transfer") return `${agent} transferred${campaign}`;
  if (e.event_subtype === "login") return `${agent} logged in`;
  if (e.event_subtype === "logout") return `${agent} logged out`;
  if (e.event_subtype === "break_start") return `${agent} on break`;
  if (e.event_subtype === "break_end") return `${agent} back from break`;
  return `${agent} ${e.event_subtype || e.event_type}${campaign}`;
}

export default function AlertTicker({ anomalies, alerts, liveEvents }: AlertTickerProps) {
  const items: { severity: string; message: string }[] = [];

  // Prepend live events (last 10 within 5 minutes)
  if (liveEvents && liveEvents.length > 0) {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recent = liveEvents
      .filter((e) => new Date(e.event_timestamp).getTime() > fiveMinAgo)
      .slice(0, 10);

    for (const e of recent) {
      items.push({
        severity: "live",
        message: `LIVE: ${formatLiveEvent(e)}`,
      });
    }
  }

  for (const a of anomalies) {
    const name = a.agent_name || "System";
    const detail = a.metric_value != null ? ` (${a.metric_value.toFixed(2)})` : "";
    items.push({
      severity: a.severity,
      message: `${name}: ${a.anomaly_type.replace(/_/g, " ")}${detail}`,
    });
  }

  for (const a of alerts) {
    items.push({
      severity: a.severity,
      message: a.message,
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center h-8 px-3 border-b border-[#1a2332] bg-[#0c1018]">
        <span className="text-[9px] text-white/15 font-mono">NO ALERTS</span>
      </div>
    );
  }

  const SeverityIcon = ({ severity }: { severity: string }) => {
    if (severity === "live") return <Radio size={10} className="text-emerald-400 shrink-0" />;
    if (severity === "critical") return <AlertCircle size={10} className="text-red-400 shrink-0" />;
    if (severity === "warning") return <AlertTriangle size={10} className="text-amber-400 shrink-0" />;
    return <Info size={10} className="text-blue-400 shrink-0" />;
  };

  return (
    <div className="flex items-center h-8 px-3 border-b border-[#1a2332] bg-[#0c1018] overflow-hidden">
      <div className="flex items-center gap-4 animate-marquee whitespace-nowrap">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <SeverityIcon severity={item.severity} />
            <span className={`text-[10px] font-mono ${
              item.severity === "live" ? "text-emerald-400/80" :
              item.severity === "critical" ? "text-red-400/80" :
              item.severity === "warning" ? "text-amber-400/80" :
              "text-white/40"
            }`}>
              {item.message}
            </span>
            {i < items.length - 1 && (
              <span className="text-[#1a2332] mx-2">|</span>
            )}
          </span>
        ))}
        {/* Duplicate for seamless scroll */}
        {items.length > 3 && items.map((item, i) => (
          <span key={`dup-${i}`} className="inline-flex items-center gap-1.5">
            <SeverityIcon severity={item.severity} />
            <span className={`text-[10px] font-mono ${
              item.severity === "live" ? "text-emerald-400/80" :
              item.severity === "critical" ? "text-red-400/80" :
              item.severity === "warning" ? "text-amber-400/80" :
              "text-white/40"
            }`}>
              {item.message}
            </span>
            {i < items.length - 1 && (
              <span className="text-[#1a2332] mx-2">|</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
