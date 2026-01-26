import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { DatabaseCallRow } from '@/types/qa-types';

export function useRecentQAStats() {
    const [statsContext, setStatsContext] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const { data, error } = await supabase
                    .from('QA Results')
                    .select('created_at, compliance_score, risk_level, call_status, tag')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error || !data) {
                    console.error("Error fetching QA stats:", error);
                    setStatsContext("Recent activity data unavailable.");
                    return;
                }

                const rows = data as Partial<DatabaseCallRow>[];
                if (rows.length === 0) {
                    setStatsContext("No recent QA activity found.");
                    return;
                }

                // Calculate metrics
                const totalCalls = rows.length;
                const scores = rows.map(r => r.compliance_score || 0).filter(s => s > 0);
                const avgScore = scores.length > 0
                    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                    : 0;

                const highRiskCount = rows.filter(r => r.risk_level === 'High' || r.risk_level === 'Critical').length;
                const needsReviewCount = rows.filter(r => r.call_status === 'Needs Review' || r.tag === 'escalated').length;
                const lastCallTime = new Date(rows[0].created_at!).toLocaleString('en-US', {
                    weekday: 'short', hour: 'numeric', minute: 'numeric'
                });

                // Construct Context String
                const context = `Recent Activity (Last ${totalCalls} calls):
- Average Score: ${avgScore}%
- High Risk Calls: ${highRiskCount}
- Pending Reviews: ${needsReviewCount}
- Most Recent Update: ${lastCallTime}`;

                setStatsContext(context);
            } catch (err) {
                console.error("Failed to fetch recent stats for Aura:", err);
                setStatsContext("Recent activity data unavailable due to error.");
            } finally {
                setIsLoading(false);
            }
        }

        fetchStats();
    }, []);

    return { statsContext, isLoading };
}
