"use client";

import { AlertTriangle, UserMinus, Trash2 } from "lucide-react";

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTerminate: () => void;
    onRemove: () => void;
    employeeName: string;
    isAlreadyTerminated: boolean;
    isProcessing: boolean;
}

export default function DeleteConfirmationModal({
    isOpen,
    onClose,
    onTerminate,
    onRemove,
    employeeName,
    isAlreadyTerminated,
    isProcessing
}: DeleteConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 mb-4">
                        <AlertTriangle className="h-6 w-6 text-amber-600" />
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 mb-1 text-center">Remove Employee</h3>
                    <p className="text-sm text-gray-500 mb-6 text-center">
                        What would you like to do with <span className="font-semibold text-gray-900">{employeeName}</span>?
                    </p>

                    <div className="space-y-3">
                        {/* Terminate Option */}
                        {!isAlreadyTerminated && (
                            <button
                                onClick={onTerminate}
                                disabled={isProcessing}
                                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-left disabled:opacity-50"
                            >
                                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100 shrink-0">
                                    <UserMinus className="h-5 w-5 text-amber-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-amber-900">
                                        {isProcessing ? "Terminating..." : "Terminate"}
                                    </div>
                                    <div className="text-xs text-amber-700/70">
                                        Mark as terminated. Record is kept for rehire.
                                    </div>
                                </div>
                            </button>
                        )}

                        {/* Remove Permanently Option */}
                        <button
                            onClick={onRemove}
                            disabled={isProcessing}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-left disabled:opacity-50"
                        >
                            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-100 shrink-0">
                                <Trash2 className="h-5 w-5 text-red-600" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-semibold text-red-900">
                                    {isProcessing ? "Removing..." : "Remove Permanently"}
                                </div>
                                <div className="text-xs text-red-700/70">
                                    Delete from the directory entirely. This cannot be undone.
                                </div>
                            </div>
                        </button>

                        {/* Cancel */}
                        <button
                            onClick={onClose}
                            disabled={isProcessing}
                            className="w-full py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
