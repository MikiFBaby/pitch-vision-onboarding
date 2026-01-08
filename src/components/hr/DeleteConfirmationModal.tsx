"use client";

import { AlertTriangle } from "lucide-react";

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    employeeName: string;
    isDeleting: boolean;
}

export default function DeleteConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    employeeName,
    isDeleting
}: DeleteConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Employee</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        Are you sure you want to delete <span className="font-semibold text-gray-900">{employeeName}</span>? This action cannot be undone.
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isDeleting}
                            className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-500/30 disabled:opacity-50 flex items-center justify-center"
                        >
                            {isDeleting ? "Deleting..." : "Delete Member"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
