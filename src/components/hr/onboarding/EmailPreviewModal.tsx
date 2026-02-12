"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Mail, User, Calendar } from "lucide-react";

interface EmailPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirmSend: () => void;
    emailHtml: string;
    recipientName: string;
    recipientEmail: string;
    trainingDate: string;
    isSending: boolean;
}

export default function EmailPreviewModal({
    isOpen,
    onClose,
    onConfirmSend,
    emailHtml,
    recipientName,
    recipientEmail,
    trainingDate,
    isSending
}: EmailPreviewModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !isSending && onClose()}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
                    >
                        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl w-full max-w-2xl overflow-hidden my-8">
                            {/* Header */}
                            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-indigo-500/20">
                                        <Mail className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Email Preview</h2>
                                        <p className="text-sm text-zinc-500">Review before sending</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    disabled={isSending}
                                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                >
                                    <X className="w-5 h-5 text-zinc-500" />
                                </button>
                            </div>

                            {/* Email Meta */}
                            <div className="px-5 py-3 border-b border-zinc-800 space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-zinc-500 w-16">From:</span>
                                    <span className="text-white">Alisha M - HR Manager &lt;hr@pitchperfectsolutions.com&gt;</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-zinc-500 w-16">To:</span>
                                    <div className="flex items-center gap-2">
                                        <User className="w-3.5 h-3.5 text-zinc-400" />
                                        <span className="text-white">{recipientName} &lt;{recipientEmail}&gt;</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-zinc-500 w-16">Subject:</span>
                                    <span className="text-white">Welcome to Pitch Perfect Solutions - Onboarding Information</span>
                                </div>
                                {trainingDate && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-zinc-500 w-16">Training:</span>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                            <span className="text-indigo-400 font-medium">{trainingDate}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Email Preview */}
                            <div className="p-5 max-h-[50vh] overflow-y-auto">
                                <div
                                    className="bg-white rounded-xl overflow-hidden shadow-lg"
                                    dangerouslySetInnerHTML={{ __html: emailHtml }}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between p-5 border-t border-zinc-800">
                                <button
                                    onClick={onClose}
                                    disabled={isSending}
                                    className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                                >
                                    Go Back & Edit
                                </button>
                                <button
                                    onClick={onConfirmSend}
                                    disabled={isSending}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 disabled:shadow-none"
                                >
                                    {isSending ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Confirm & Send
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
