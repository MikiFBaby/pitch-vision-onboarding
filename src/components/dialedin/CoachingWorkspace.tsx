"use client";

import DeclineAlertsPanel from "./DeclineAlertsPanel";
import ConsistencyPanel from "./ConsistencyPanel";
import RampCurvePanel from "./RampCurvePanel";
import CoachingPanel from "./CoachingPanel";
import QACompliancePanel from "./QACompliancePanel";
import type { AgentTrend } from "@/types/dialedin-types";

interface CoachingWorkspaceProps {
  trends: Record<string, AgentTrend>;
}

export default function CoachingWorkspace({ trends }: CoachingWorkspaceProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Decline Alerts + Consistency Scores */}
      <div className="grid grid-cols-2 h-[280px] shrink-0">
        <DeclineAlertsPanel />
        <ConsistencyPanel trends={trends} />
      </div>

      {/* New Hire Ramp Curve */}
      <div className="h-[250px] shrink-0">
        <RampCurvePanel />
      </div>

      {/* QA Compliance */}
      <div className="h-[280px] shrink-0">
        <QACompliancePanel />
      </div>

      {/* Coaching Impact Tracker */}
      <div className="flex-1 min-h-[300px]">
        <CoachingPanel />
      </div>
    </div>
  );
}
