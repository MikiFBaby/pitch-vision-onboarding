export const getAgentStats = () => {
    return {
        complianceScore: 94,
        slaScore: 88,
        callsAnalyzed: 142,
        rank: 3,
        complianceTrend: "up",
        slaTrend: "down",
        // New stats
        callsMade: 187,
        avgSlaByHour: 91,
        basePay: 1840,
        bonusPay: 425,
        payPeriod: "Dec 16-31",
    };
};


export const getRecentCalls = () => {
    return [
        {
            id: "c-1001",
            date: "2023-10-27 14:30",
            customer: "John Doe",
            duration: "4:12",
            score: 92,
            status: "Validated",
            uploadType: "automated"
        },
        {
            id: "c-1002",
            date: "2023-10-27 15:15",
            customer: "Jane Smith",
            duration: "7:45",
            score: 78,
            status: "Analyzed",
            uploadType: "manual"
        },
        {
            id: "c-1003",
            date: "2023-10-27 16:00",
            customer: "Acme Corp",
            duration: "2:30",
            score: 98,
            status: "Validated",
            uploadType: "automated"
        },
        {
            id: "c-1004",
            date: "2023-10-28 09:15",
            customer: "Global Tech",
            duration: "12:10",
            score: 65,
            status: "Flagged",
            uploadType: "manual"
        },
    ];
};
