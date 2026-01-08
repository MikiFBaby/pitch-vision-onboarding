"use client";

import EmployeeTable from "@/components/hr/EmployeeTable";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function HRDirectoryPage() {
    return (
        <DashboardLayout>
            <div className="space-y-8 max-w-[1600px] mx-auto p-4 md:p-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Employee Directory</h1>
                    <p className="text-white/60 mt-2">Manage and view all employee records</p>
                </div>

                <EmployeeTable />
            </div>
        </DashboardLayout>
    );
}
