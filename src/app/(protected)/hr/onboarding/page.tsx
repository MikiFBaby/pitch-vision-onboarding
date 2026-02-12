"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import OnboardingPortal from "@/components/hr/onboarding/OnboardingPortal";
import AddNewHireModal from "@/components/hr/onboarding/AddNewHireModal";

export default function EmployeeOnboardingPage() {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-[1600px] mx-auto p-4 md:p-8">
                <OnboardingPortal onAddNewHire={() => setIsAddModalOpen(true)} />

                <AddNewHireModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                />
            </div>
        </DashboardLayout>
    );
}
