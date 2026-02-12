"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, Mail, User, MapPin, Loader2, CheckCircle2, Phone, Calendar, Send, FileSignature, DollarSign, RotateCcw, Search, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import EmailPreviewModal from "./EmailPreviewModal";

type ModalStep = 'ask' | 'new' | 'returning';

interface TerminatedEmployee {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    country: string | null;
    role: string | null;
    terminated_at: string | null;
    reason: string | null;
    firedOrQuit: string | null;
    source: 'directory' | 'hr_fired';
}

interface AddNewHireModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface FormData {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    country: "Canada" | "USA" | "";
    trainingStartDate: string;
    contractEffectiveDate: string;
    hourlyWage: string;
    sendOnboardingEmail: boolean;
    sendContract: boolean;
}

export default function AddNewHireModal({ isOpen, onClose }: AddNewHireModalProps) {
    const [step, setStep] = useState<ModalStep>('ask');
    const [terminatedEmployees, setTerminatedEmployees] = useState<TerminatedEmployee[]>([]);
    const [returningSearch, setReturningSearch] = useState('');
    const [loadingTerminated, setLoadingTerminated] = useState(false);
    const [reactivating, setReactivating] = useState<string | null>(null);

    const [formData, setFormData] = useState<FormData>({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        country: "",
        trainingStartDate: "",
        contractEffectiveDate: "",
        hourlyWage: "",
        sendOnboardingEmail: true,
        sendContract: true
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
    const [showEmailPreview, setShowEmailPreview] = useState(false);

    const validateForm = () => {
        const newErrors: Partial<Record<keyof FormData, string>> = {};

        if (!formData.firstName.trim()) {
            newErrors.firstName = "First name is required";
        }
        if (!formData.lastName.trim()) {
            newErrors.lastName = "Last name is required";
        }
        if (!formData.email.trim()) {
            newErrors.email = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = "Please enter a valid email";
        }
        if (!formData.phone.trim()) {
            newErrors.phone = "Phone number is required";
        }
        if (!formData.country) {
            newErrors.country = "Please select a country";
        }
        if (formData.sendOnboardingEmail && !formData.trainingStartDate) {
            newErrors.trainingStartDate = "Training start date is required to send email";
        }
        if (formData.sendContract && !formData.contractEffectiveDate) {
            newErrors.contractEffectiveDate = "Contract date is required to send contract";
        }
        if (formData.sendContract && !formData.hourlyWage) {
            newErrors.hourlyWage = "Hourly wage is required to send contract";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const formatTrainingDate = (dateStr: string) => {
        const date = new Date(dateStr + "T00:00:00");
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        return date.toLocaleDateString('en-US', options);
    };

    const generateOnboardingEmailHtml = () => {
        const fullName = `${formData.firstName} ${formData.lastName}`;
        const formattedDate = formData.trainingStartDate ? formatTrainingDate(formData.trainingStartDate) : "[Training Date]";

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Pitch Perfect Solutions</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <tr>
            <td style="background-color: #ffffff; padding: 30px 30px 20px 30px; text-align: center; border-bottom: 3px solid #7c3aed;">
                <img src="https://eyrxkirpubylgkkvcrlh.supabase.co/storage/v1/object/public/employee_documents/onboarding-attachments/pp-logo-black.png" alt="Pitch Perfect Solutions" style="max-width: 220px; height: auto; margin-bottom: 16px;" />
                <h1 style="color: #1a1a1a; margin: 0; font-size: 24px; font-weight: 700;">Welcome to the Team!</h1>
            </td>
        </tr>

        <!-- Body -->
        <tr>
            <td style="padding: 40px 30px;">
                <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear ${fullName},
                </p>

                <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    My name is Alisha, and I am the HR Manager at Pitch Perfect Solutions. I am pleased to officially welcome you to our team. I personally selected you for this opportunity and am confident that you will be a strong contributor and succeed in this role.
                </p>

                <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Attached to this email, you will find the required training materials, along with the Zoom link for your upcoming training session.
                </p>

                <!-- Training Details Box -->
                <div style="background-color: #f8f9fa; border-left: 4px solid #7c3aed; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                    <h3 style="color: #7c3aed; margin: 0 0 15px 0; font-size: 18px;">Training Details</h3>
                    <table style="width: 100%;">
                        <tr>
                            <td style="color: #666; font-size: 14px; padding: 5px 0;"><strong>Start Date:</strong></td>
                            <td style="color: #333; font-size: 14px; padding: 5px 0;">${formattedDate}</td>
                        </tr>
                        <tr>
                            <td style="color: #666; font-size: 14px; padding: 5px 0;"><strong>Time:</strong></td>
                            <td style="color: #333; font-size: 14px; padding: 5px 0;">9:20 AM EST</td>
                        </tr>
                        <tr>
                            <td style="color: #666; font-size: 14px; padding: 5px 0;"><strong>Platform:</strong></td>
                            <td style="color: #333; font-size: 14px; padding: 5px 0;">Zoom (link attached)</td>
                        </tr>
                    </table>
                </div>

                <!-- Required Documents -->
                <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 8px;">
                    <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 18px;">Required Documents</h3>
                    <p style="color: #92400e; font-size: 14px; margin: 0 0 10px 0;">To complete your onboarding process, please ensure the following items are submitted prior to your first day of training:</p>
                    <ul style="color: #78350f; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                        <li>Updated resume</li>
                        <li>Photo ID or Photo ID accompanied by a document showing your name and address</li>
                        <li>Employment contract (already sent digitally and must be signed as soon as possible)</li>
                        <li>${formData.country === "Canada" ? "Void cheque for direct deposit setup" : "Direct deposit authorization form"}</li>
                        <li>${formData.country === "Canada" ? "Copy of your Social Insurance Number (SIN) card" : "Copy of your Social Security (SSN) card"}</li>
                    </ul>
                </div>

                <!-- Slack Notice -->
                <div style="background-color: #dbeafe; border: 1px solid #3b82f6; padding: 20px; margin: 25px 0; border-radius: 8px;">
                    <h3 style="color: #1e40af; margin: 0 0 10px 0; font-size: 16px;">Slack Setup</h3>
                    <p style="color: #1e40af; font-size: 14px; line-height: 1.6; margin: 0;">
                        Please also download the <strong>Slack application</strong> on your computer before training. <strong>Do not create an account</strong> at this time. I will guide you through the setup process on your first day. Slack is our primary internal communication platform and will be used regularly moving forward.
                    </p>
                </div>

                <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 25px 0 20px 0;">
                    If you have any questions or require assistance, please feel free to contact me.
                </p>

                <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    We look forward to working with you and are excited to have you join the team.
                </p>

                <!-- Signature -->
                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
                    <p style="color: #333; font-size: 16px; margin: 0 0 5px 0;">Sincerely,</p>
                    <p style="color: #7c3aed; font-size: 18px; font-weight: 600; margin: 0 0 5px 0;">Alisha M</p>
                    <p style="color: #666; font-size: 14px; margin: 0 0 5px 0;">HR Manager</p>
                    <p style="color: #666; font-size: 14px; margin: 0;">Pitch Perfect Solutions</p>
                </div>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="background-color: #7c3aed; padding: 20px 30px; text-align: center;">
                <p style="color: rgba(255,255,255,0.85); font-size: 12px; margin: 0;">
                    &copy; ${new Date().getFullYear()} Pitch Perfect Solutions. All rights reserved.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
        `;
    };

    const STORAGE_BASE = "https://eyrxkirpubylgkkvcrlh.supabase.co/storage/v1/object/public/employee_documents/onboarding-attachments";

    const ONBOARDING_ATTACHMENTS = [
        { filename: "Welcome_Letter.pdf", path: `${STORAGE_BASE}/Welcome_Letter.pdf` },
        { filename: "Zoom_Training_Link.pdf", path: `${STORAGE_BASE}/Zoom_Training_Link.pdf` },
        { filename: "State_Abbreviations.pdf", path: `${STORAGE_BASE}/State_Abbreviations.pdf` },
        { filename: "Rules_of_Disposition.pdf", path: `${STORAGE_BASE}/Rules_of_Disposition.pdf` },
        { filename: "PC_Laptop_Requirements.pdf", path: `${STORAGE_BASE}/PC_Laptop_Requirements.pdf` },
        { filename: "Cold_Transfer_Guide.docx", path: `${STORAGE_BASE}/Cold_Transfer_Guide.docx` },
        { filename: "Tips_and_Tricks.pdf", path: `${STORAGE_BASE}/Tips_and_Tricks.pdf` },
    ];

    const sendOnboardingEmail = async () => {
        try {
            const response = await fetch("/api/email/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: formData.email,
                    subject: "Welcome to Pitch Perfect Solutions - Onboarding Information",
                    html: generateOnboardingEmailHtml(),
                    senderName: "Alisha M - HR Manager",
                    attachments: ONBOARDING_ATTACHMENTS
                })
            });

            const result = await response.json();
            return result.success || result.simulated;
        } catch (error) {
            console.error("Failed to send onboarding email:", error);
            return false;
        }
    };

    const resetForm = () => {
        setFormData({
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            country: "",
            trainingStartDate: "",
            contractEffectiveDate: "",
            hourlyWage: "",
            sendOnboardingEmail: true,
            sendContract: true
        });
        setStep('ask');
        setReturningSearch('');
        setTerminatedEmployees([]);
        setReactivating(null);
    };

    const fetchTerminatedEmployees = async () => {
        setLoadingTerminated(true);
        try {
            // Fetch from both sources in parallel
            const [{ data: dirData, error: dirError }, { data: firedData, error: firedError }] = await Promise.all([
                supabase
                    .from('employee_directory')
                    .select('id, first_name, last_name, email, phone, country, role, terminated_at')
                    .eq('employee_status', 'Terminated')
                    .order('terminated_at', { ascending: false }),
                supabase
                    .from('HR Fired')
                    .select('*'),
            ]);

            if (dirError) throw dirError;
            if (firedError) throw firedError;

            // Build map from employee_directory (keyed by lowercase full name)
            const directoryMap = new Map<string, TerminatedEmployee>();
            (dirData || []).forEach(emp => {
                const key = `${(emp.first_name || '').trim().toLowerCase()} ${(emp.last_name || '').trim().toLowerCase()}`;
                directoryMap.set(key, {
                    id: emp.id,
                    first_name: emp.first_name,
                    last_name: emp.last_name,
                    email: emp.email || '',
                    phone: emp.phone,
                    country: emp.country,
                    role: emp.role,
                    terminated_at: emp.terminated_at,
                    reason: null,
                    firedOrQuit: null,
                    source: 'directory',
                });
            });

            // Deduplicate HR Fired by Agent Name
            const seenFired = new Set<string>();
            const dedupedFired = (firedData || []).filter((r: any) => {
                const name = (r['Agent Name'] || '').trim().toLowerCase();
                if (!name || seenFired.has(name)) return false;
                seenFired.add(name);
                return true;
            });

            // Merge: directory records take priority, add HR Fired records not in directory
            const merged = new Map(directoryMap);
            dedupedFired.forEach((fired: any) => {
                const fullName = (fired['Agent Name'] || '').trim();
                const key = fullName.toLowerCase();
                if (!merged.has(key)) {
                    // Parse first/last from "Agent Name"
                    const parts = fullName.split(' ');
                    const firstName = parts[0] || '';
                    const lastName = parts.slice(1).join(' ') || '';
                    const geo = (fired['Canadian/American'] || '').toLowerCase();

                    merged.set(key, {
                        id: fired.id,
                        first_name: firstName,
                        last_name: lastName,
                        email: '',
                        phone: null,
                        country: geo.includes('canad') ? 'Canada' : geo.includes('americ') ? 'USA' : null,
                        role: null,
                        terminated_at: fired['Termination Date'] || null,
                        reason: fired['Reason for Termination'] || null,
                        firedOrQuit: fired['Fired/Quit'] || null,
                        source: 'hr_fired',
                    });
                } else {
                    // Enrich directory record with HR Fired details
                    const existing = merged.get(key)!;
                    existing.reason = fired['Reason for Termination'] || existing.reason;
                    existing.firedOrQuit = fired['Fired/Quit'] || existing.firedOrQuit;
                }
            });

            // Sort by termination date descending
            const result = Array.from(merged.values()).sort((a, b) => {
                const dateA = a.terminated_at ? new Date(a.terminated_at).getTime() : 0;
                const dateB = b.terminated_at ? new Date(b.terminated_at).getTime() : 0;
                return dateB - dateA;
            });

            setTerminatedEmployees(result);
        } catch (error) {
            console.error('Error fetching terminated employees:', error);
        } finally {
            setLoadingTerminated(false);
        }
    };

    const handleReactivate = async (emp: TerminatedEmployee) => {
        setReactivating(emp.id);
        try {
            if (emp.source === 'directory') {
                // Existing directory record — reactivate
                await supabase
                    .from('employee_directory')
                    .update({
                        employee_status: 'Active',
                        terminated_at: null,
                        hired_at: new Date().toISOString(),
                    })
                    .eq('id', emp.id);
            }
            // For HR Fired-only records, no directory record exists yet —
            // the form submission will create one via the normal flow

            // Pre-fill the form with their details and switch to the new hire form
            setFormData(prev => ({
                ...prev,
                firstName: emp.first_name || '',
                lastName: emp.last_name || '',
                email: emp.email || '',
                phone: emp.phone || '',
                country: (emp.country as "Canada" | "USA" | "") || '',
            }));
            setStep('new');
        } catch (error) {
            console.error('Error reactivating employee:', error);
        } finally {
            setReactivating(null);
        }
    };

    const filteredTerminated = terminatedEmployees.filter(emp => {
        if (!returningSearch.trim()) return true;
        const term = returningSearch.toLowerCase();
        const full = `${emp.first_name} ${emp.last_name}`.toLowerCase();
        return full.includes(term) || (emp.email || '').toLowerCase().includes(term);
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        // If email toggle is on and preview hasn't been shown yet, show preview first
        if (formData.sendOnboardingEmail && !showEmailPreview) {
            setShowEmailPreview(true);
            return;
        }

        await executeSubmit();
    };

    const executeSubmit = async () => {
        setShowEmailPreview(false);
        setIsSubmitting(true);

        try {
            const emailLower = formData.email.trim().toLowerCase();

            // 1. Create or update employee_directory record
            let employeeId: string;

            const { data: existingEmployee } = await supabase
                .from("employee_directory")
                .select("id")
                .eq("email", emailLower)
                .maybeSingle();

            if (existingEmployee) {
                employeeId = existingEmployee.id;
                await supabase
                    .from("employee_directory")
                    .update({
                        phone: formData.phone.trim(),
                        country: formData.country,
                        hourly_wage: formData.hourlyWage ? parseFloat(formData.hourlyWage) : null,
                        contract_effective_date: formData.contractEffectiveDate || null,
                        contract_status: formData.sendContract ? "sending" : "not_sent",
                        training_start_date: formData.trainingStartDate || null,
                    })
                    .eq("id", employeeId);
            } else {
                const { data: newEmployee, error: empError } = await supabase
                    .from("employee_directory")
                    .insert({
                        first_name: formData.firstName.trim(),
                        last_name: formData.lastName.trim(),
                        email: emailLower,
                        phone: formData.phone.trim(),
                        role: "Agent",
                        country: formData.country,
                        hourly_wage: formData.hourlyWage ? parseFloat(formData.hourlyWage) : null,
                        contract_effective_date: formData.contractEffectiveDate || null,
                        contract_status: formData.sendContract ? "sending" : "not_sent",
                        training_start_date: formData.trainingStartDate || null,
                        employee_status: "Active",
                    })
                    .select()
                    .single();

                if (empError) throw empError;
                employeeId = newEmployee.id;
            }

            // 2. Insert onboarding_new_hires linked to employee_directory
            const { data: newHire, error: hireError } = await supabase
                .from("onboarding_new_hires")
                .insert({
                    first_name: formData.firstName.trim(),
                    last_name: formData.lastName.trim(),
                    email: emailLower,
                    phone: formData.phone.trim(),
                    country: formData.country,
                    training_start_date: formData.trainingStartDate || null,
                    employee_id: employeeId,
                    status: "not_started",
                    onboarding_email_sent: false
                })
                .select()
                .single();

            if (hireError) throw hireError;

            // 3. Create progress records for country-specific checklist items
            const { data: checklistItems, error: checklistError } = await supabase
                .from("onboarding_checklist_items")
                .select("id, country")
                .or(`country.is.null,country.eq.${formData.country}`);

            if (checklistError) throw checklistError;

            if (checklistItems && checklistItems.length > 0) {
                const progressRecords = checklistItems.map(item => ({
                    new_hire_id: newHire.id,
                    checklist_item_id: item.id,
                    status: "pending"
                }));

                const { error: progressError } = await supabase
                    .from("onboarding_progress")
                    .insert(progressRecords);

                if (progressError) throw progressError;
            }

            // 4. Send onboarding email if toggled on
            if (formData.sendOnboardingEmail) {
                const emailSent = await sendOnboardingEmail();

                // Update both tables
                const emailUpdate = {
                    onboarding_email_sent: emailSent,
                    onboarding_email_sent_at: emailSent ? new Date().toISOString() : null
                };

                await Promise.all([
                    supabase.from("onboarding_new_hires").update(emailUpdate).eq("id", newHire.id),
                    supabase.from("employee_directory").update(emailUpdate).eq("id", employeeId)
                ]);

                // Auto-complete "Onboarding Materials Sent" checklist item
                if (emailSent) {
                    const MATERIALS_SENT_ITEM_ID = "c0a80121-0002-4000-8000-000000000001";
                    await supabase
                        .from("onboarding_progress")
                        .update({
                            status: "completed",
                            completed_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq("new_hire_id", newHire.id)
                        .eq("checklist_item_id", MATERIALS_SENT_ITEM_ID);
                }
            }

            // 5. Send contract for signing via DocuSeal
            if (formData.sendContract) {
                try {
                    const contractRes = await fetch("/api/docuseal/send-contract", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            newHireId: newHire.id,
                            employeeId,
                            firstName: formData.firstName.trim(),
                            lastName: formData.lastName.trim(),
                            email: emailLower,
                            country: formData.country,
                            contractEffectiveDate: formData.contractEffectiveDate,
                            hourlyWage: formData.hourlyWage
                        })
                    });

                    const contractResult = await contractRes.json();

                    const contractUpdate = {
                        contract_status: contractResult.success ? "sent" : "failed",
                        docuseal_submission_id: contractResult.submissionId || null,
                        contract_sent_at: contractResult.success ? new Date().toISOString() : null
                    };

                    await supabase
                        .from("employee_directory")
                        .update(contractUpdate)
                        .eq("id", employeeId);

                    // Mark the contract checklist item as in_progress when sent
                    if (contractResult.success) {
                        const CONTRACT_ITEM_ID = "c0a80121-0001-4000-8000-000000000001";
                        await supabase
                            .from("onboarding_progress")
                            .update({
                                status: "in_progress",
                                updated_at: new Date().toISOString()
                            })
                            .eq("new_hire_id", newHire.id)
                            .eq("checklist_item_id", CONTRACT_ITEM_ID);

                        // Update hire status to in_progress
                        await supabase
                            .from("onboarding_new_hires")
                            .update({
                                status: "in_progress",
                                updated_at: new Date().toISOString()
                            })
                            .eq("id", newHire.id);
                    }
                } catch (contractError) {
                    console.error("Failed to send contract:", contractError);
                    await supabase
                        .from("employee_directory")
                        .update({ contract_status: "failed" })
                        .eq("id", employeeId);
                }
            }

            setIsSuccess(true);

            setTimeout(() => {
                resetForm();
                setIsSuccess(false);
                onClose();
            }, 1500);
        } catch (error) {
            console.error("Error adding new hire:", error);
            setErrors({ email: "Failed to add new hire. Please try again." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            resetForm();
            setErrors({});
            setIsSuccess(false);
            setStep('ask');
            onClose();
        }
    };

    return (
        <>
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
                    >
                        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl w-full max-w-md overflow-hidden my-8">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                                <div className="flex items-center gap-3">
                                    {step !== 'ask' && (
                                        <button
                                            onClick={() => setStep('ask')}
                                            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors mr-1"
                                        >
                                            <ArrowLeft className="w-4 h-4 text-zinc-400" />
                                        </button>
                                    )}
                                    <div className="p-2.5 rounded-xl bg-indigo-500/20">
                                        {step === 'returning' ? (
                                            <RotateCcw className="w-5 h-5 text-emerald-400" />
                                        ) : (
                                            <UserPlus className="w-5 h-5 text-indigo-400" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">
                                            {step === 'ask' ? 'Add New Hire' : step === 'returning' ? 'Returning Agent' : 'New Agent Details'}
                                        </h2>
                                        <p className="text-sm text-zinc-400">
                                            {step === 'ask' ? 'Is this a new or returning agent?' : step === 'returning' ? 'Search for a previously terminated agent' : 'Create a new agent onboarding record'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleClose}
                                    disabled={isSubmitting}
                                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                >
                                    <X className="w-5 h-5 text-zinc-500" />
                                </button>
                            </div>

                            {/* Ask Step */}
                            {step === 'ask' && (
                                <div className="p-6 space-y-3">
                                    <button
                                        onClick={() => setStep('new')}
                                        className="w-full flex items-center gap-4 p-5 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all group text-left"
                                    >
                                        <div className="p-3 rounded-xl bg-indigo-500/20 group-hover:bg-indigo-500/30 transition-colors">
                                            <UserPlus className="w-6 h-6 text-indigo-400" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white text-base">New Agent</p>
                                            <p className="text-sm text-zinc-300 mt-0.5">First time joining the company</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setStep('returning');
                                            fetchTerminatedEmployees();
                                        }}
                                        className="w-full flex items-center gap-4 p-5 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group text-left"
                                    >
                                        <div className="p-3 rounded-xl bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
                                            <RotateCcw className="w-6 h-6 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white text-base">Returning Agent</p>
                                            <p className="text-sm text-zinc-300 mt-0.5">Previously worked with us, rejoining the team</p>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Returning Step */}
                            {step === 'returning' && (
                                <div className="p-6 space-y-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                        <input
                                            type="text"
                                            value={returningSearch}
                                            onChange={(e) => setReturningSearch(e.target.value)}
                                            placeholder="Search by name or email..."
                                            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm"
                                        />
                                    </div>

                                    <p className="text-xs text-zinc-400 text-right">{filteredTerminated.length} of {terminatedEmployees.length} agents</p>

                                    <div className="max-h-96 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-white/10">
                                        {loadingTerminated ? (
                                            <div className="py-8 flex flex-col items-center">
                                                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                                                <p className="text-sm text-zinc-400 mt-2">Loading terminated agents...</p>
                                            </div>
                                        ) : filteredTerminated.length === 0 ? (
                                            <div className="py-8 text-center">
                                                <p className="text-sm text-zinc-400">
                                                    {returningSearch ? 'No matching terminated agents found' : 'No terminated agents found'}
                                                </p>
                                            </div>
                                        ) : (
                                            filteredTerminated.map(emp => (
                                                <div
                                                    key={emp.id}
                                                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/50 hover:border-zinc-600 transition-all"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-medium text-white text-sm truncate">
                                                            {emp.first_name} {emp.last_name}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            {emp.email && (
                                                                <span className="text-xs text-zinc-400 truncate max-w-[160px]">{emp.email}</span>
                                                            )}
                                                            {emp.country && (
                                                                <span className="text-xs text-zinc-400 flex items-center gap-0.5">
                                                                    <MapPin className="w-3 h-3" />{emp.country}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {emp.terminated_at && (
                                                                <span className="text-xs text-zinc-400">
                                                                    Left: {new Date(emp.terminated_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
                                                            )}
                                                            {emp.firedOrQuit && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                                    emp.firedOrQuit.toLowerCase() === 'quit'
                                                                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                                }`}>
                                                                    {emp.firedOrQuit}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleReactivate(emp)}
                                                        disabled={reactivating === emp.id}
                                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 border border-emerald-500/20 transition-all disabled:opacity-50 flex-shrink-0 ml-3"
                                                    >
                                                        {reactivating === emp.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        )}
                                                        Reactivate
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <p className="text-xs text-zinc-400 text-center">
                                        Select an agent to reactivate and pre-fill the onboarding form
                                    </p>
                                </div>
                            )}

                            {/* New Hire Form */}
                            {step === 'new' && (
                            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                {/* Success State */}
                                {isSuccess ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="py-8 flex flex-col items-center"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                                            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                                        </div>
                                        <p className="text-lg font-semibold text-white">New Hire Added!</p>
                                        <p className="text-zinc-400 mt-1 text-center">
                                            {formData.sendContract && formData.sendOnboardingEmail
                                                ? "Contract sent for signing & onboarding email sent"
                                                : formData.sendContract
                                                ? "Contract sent for digital signing"
                                                : formData.sendOnboardingEmail
                                                ? "Onboarding email has been sent"
                                                : "Onboarding checklist has been created"}
                                        </p>
                                    </motion.div>
                                ) : (
                                    <>
                                        {/* Name Row */}
                                        <div className="grid grid-cols-2 gap-3">
                                            {/* First Name */}
                                            <div>
                                                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                    First Name
                                                </label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                    <input
                                                        type="text"
                                                        value={formData.firstName}
                                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                                        placeholder="First name"
                                                        className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border ${
                                                            errors.firstName ? "border-red-500/50" : "border-zinc-700"
                                                        } text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm`}
                                                    />
                                                </div>
                                                {errors.firstName && (
                                                    <p className="text-red-400 text-xs mt-1">{errors.firstName}</p>
                                                )}
                                            </div>

                                            {/* Last Name */}
                                            <div>
                                                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                    Last Name
                                                </label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                    <input
                                                        type="text"
                                                        value={formData.lastName}
                                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                                        placeholder="Last name"
                                                        className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border ${
                                                            errors.lastName ? "border-red-500/50" : "border-zinc-700"
                                                        } text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm`}
                                                    />
                                                </div>
                                                {errors.lastName && (
                                                    <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Email */}
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                Email Address
                                            </label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                <input
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                    placeholder="email@example.com"
                                                    className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border ${
                                                        errors.email ? "border-red-500/50" : "border-zinc-700"
                                                    } text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm`}
                                                />
                                            </div>
                                            {errors.email && (
                                                <p className="text-red-400 text-xs mt-1">{errors.email}</p>
                                            )}
                                        </div>

                                        {/* Phone */}
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                Phone Number
                                            </label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                <input
                                                    type="tel"
                                                    value={formData.phone}
                                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                    placeholder="(555) 123-4567"
                                                    className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border ${
                                                        errors.phone ? "border-red-500/50" : "border-zinc-700"
                                                    } text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm`}
                                                />
                                            </div>
                                            {errors.phone && (
                                                <p className="text-red-400 text-xs mt-1">{errors.phone}</p>
                                            )}
                                        </div>

                                        {/* Country */}
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                Employment Location
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, country: "USA", hourlyWage: formData.hourlyWage || "15.00" })}
                                                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                                                        formData.country === "USA"
                                                            ? "bg-indigo-500/20 border-indigo-500/50 text-white"
                                                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                    }`}
                                                >
                                                    <MapPin className="w-4 h-4" />
                                                    <span className="font-medium text-sm">USA</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, country: "Canada", hourlyWage: formData.hourlyWage || "19.50" })}
                                                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                                                        formData.country === "Canada"
                                                            ? "bg-indigo-500/20 border-indigo-500/50 text-white"
                                                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                    }`}
                                                >
                                                    <MapPin className="w-4 h-4" />
                                                    <span className="font-medium text-sm">Canada</span>
                                                </button>
                                            </div>
                                            {errors.country && (
                                                <p className="text-red-400 text-xs mt-1">{errors.country}</p>
                                            )}
                                        </div>

                                        {/* Training Start Date */}
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                Training Start Date
                                            </label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                <input
                                                    type="date"
                                                    value={formData.trainingStartDate}
                                                    onChange={(e) => setFormData({ ...formData, trainingStartDate: e.target.value })}
                                                    min={new Date().toISOString().split('T')[0]}
                                                    className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border ${
                                                        errors.trainingStartDate ? "border-red-500/50" : "border-zinc-700"
                                                    } text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm [color-scheme:dark]`}
                                                />
                                            </div>
                                            {errors.trainingStartDate && (
                                                <p className="text-red-400 text-xs mt-1">{errors.trainingStartDate}</p>
                                            )}
                                        </div>

                                        {/* Contract Effective Date */}
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                Contract Effective Date
                                            </label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                <input
                                                    type="date"
                                                    value={formData.contractEffectiveDate}
                                                    onChange={(e) => setFormData({ ...formData, contractEffectiveDate: e.target.value })}
                                                    className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border ${
                                                        errors.contractEffectiveDate ? "border-red-500/50" : "border-zinc-700"
                                                    } text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm [color-scheme:dark]`}
                                                />
                                            </div>
                                            {errors.contractEffectiveDate && (
                                                <p className="text-red-400 text-xs mt-1">{errors.contractEffectiveDate}</p>
                                            )}
                                        </div>

                                        {/* Hourly Wage */}
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                                Hourly Wage ({formData.country === "Canada" ? "CAD" : "USD"})
                                            </label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                <input
                                                    type="number"
                                                    step="0.50"
                                                    min="0"
                                                    value={formData.hourlyWage}
                                                    onChange={(e) => setFormData({ ...formData, hourlyWage: e.target.value })}
                                                    placeholder={formData.country === "Canada" ? "19.50" : "15.00"}
                                                    className={`w-full pl-10 pr-3 py-2.5 rounded-xl bg-zinc-800/50 border ${
                                                        errors.hourlyWage ? "border-red-500/50" : "border-zinc-700"
                                                    } text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm`}
                                                />
                                            </div>
                                            {errors.hourlyWage && (
                                                <p className="text-red-400 text-xs mt-1">{errors.hourlyWage}</p>
                                            )}
                                        </div>

                                        {/* Send Contract Toggle */}
                                        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.sendContract}
                                                        onChange={(e) => setFormData({ ...formData, sendContract: e.target.checked })}
                                                        className="sr-only"
                                                    />
                                                    <div className={`w-11 h-6 rounded-full transition-colors ${
                                                        formData.sendContract ? "bg-indigo-600" : "bg-zinc-600"
                                                    }`}>
                                                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform mt-0.5 ${
                                                            formData.sendContract ? "translate-x-5.5 ml-0.5" : "translate-x-0.5"
                                                        }`} />
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <FileSignature className="w-4 h-4 text-indigo-400" />
                                                        <span className="font-medium text-white text-sm">Send Contract for Signing</span>
                                                    </div>
                                                    <p className="text-xs text-zinc-400 mt-1">
                                                        Automatically send the {formData.country || "employment"} contract via DocuSeal for digital signature
                                                    </p>
                                                </div>
                                            </label>
                                        </div>

                                        {/* Send Onboarding Email Toggle */}
                                        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.sendOnboardingEmail}
                                                        onChange={(e) => setFormData({ ...formData, sendOnboardingEmail: e.target.checked })}
                                                        className="sr-only"
                                                    />
                                                    <div className={`w-11 h-6 rounded-full transition-colors ${
                                                        formData.sendOnboardingEmail ? "bg-indigo-600" : "bg-zinc-600"
                                                    }`}>
                                                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform mt-0.5 ${
                                                            formData.sendOnboardingEmail ? "translate-x-5.5 ml-0.5" : "translate-x-0.5"
                                                        }`} />
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <Send className="w-4 h-4 text-indigo-400" />
                                                        <span className="font-medium text-white text-sm">Send Onboarding Email</span>
                                                    </div>
                                                    <p className="text-xs text-zinc-400 mt-1">
                                                        Send welcome email with training details, required documents, and link to training materials
                                                    </p>
                                                </div>
                                            </label>
                                        </div>

                                        {/* Submit Button */}
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold transition-all duration-200 shadow-lg shadow-indigo-500/25 disabled:shadow-none mt-2"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    {formData.sendContract ? "Adding & Sending Contract..." : formData.sendOnboardingEmail ? "Adding & Sending Email..." : "Adding..."}
                                                </>
                                            ) : (
                                                <>
                                                    <UserPlus className="w-5 h-5" />
                                                    {formData.sendContract ? "Add & Send Contract" : formData.sendOnboardingEmail ? "Add & Send Email" : "Add New Hire"}
                                                </>
                                            )}
                                        </button>
                                    </>
                                )}
                            </form>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>

        <EmailPreviewModal
            isOpen={showEmailPreview}
            onClose={() => setShowEmailPreview(false)}
            onConfirmSend={executeSubmit}
            emailHtml={generateOnboardingEmailHtml()}
            recipientName={`${formData.firstName} ${formData.lastName}`}
            recipientEmail={formData.email}
            trainingDate={formData.trainingStartDate ? formatTrainingDate(formData.trainingStartDate) : ""}
            isSending={isSubmitting}
        />
        </>
    );
}
