"use client";

import React, { useState, useRef, useEffect, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/context/AuthContext";
import {
    Send, TrendingUp, AlertTriangle, Users, Calendar,
    Loader2, ChevronDown, BarChart3, Zap, Mail, History, X, Check, Search, Mic, PhoneOff
} from "lucide-react";
import { generateQAComplianceReport } from "@/utils/report-generator";
import { transformRow } from "@/utils/qa-utils";
import { format, isToday, isYesterday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChatSidebar } from "./ChatSidebar";
import { searchDirectory } from "@/utils/directory-utils";
import { useUserSettings } from "@/hooks/useUserSettings";
import { TypingBubble } from "@/components/ui/typing-bubble";
import { AuraVoiceIcon } from "@/components/ui/AuraVoiceIcon";
import { useVoice } from "@/context/VoiceContext";
import { useGeminiLive } from "@/hooks/useGeminiLive";

// Generate a deterministic UUID-like string from an email
// Creates a valid UUID format for database compatibility
const generateUuidFromEmail = (email: string): string => {
    // Simple hash function for deterministic output
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < email.length; i++) {
        const ch = email.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    // Create properly formatted UUID
    const hex1 = ((h1 >>> 0) & 0xffffffff).toString(16).padStart(8, '0');
    const hex2 = ((h2 >>> 0) & 0xffffffff).toString(16).padStart(8, '0');
    // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return `${hex1}-${hex2.slice(0, 4)}-4${hex2.slice(4, 7)}-a${hex1.slice(1, 4)}-${hex2}${hex1.slice(0, 4)}`.slice(0, 36);
};

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    suggestions?: string[];  // Follow-up suggestions for clickable chips
}

const PRE_PROMPTS = [
    {
        icon: TrendingUp,
        label: "Top Performers",
        prompt: "Show my top performing agents based on compliance scores",
        color: "from-emerald-500 to-teal-600"
    },
    {
        icon: AlertTriangle,
        label: "Needs Review",
        prompt: "Which calls need review today?",
        color: "from-amber-500 to-orange-600"
    },
    {
        icon: BarChart3,
        label: "Weekly Summary",
        prompt: "Give me a compliance summary for this week",
        color: "from-indigo-500 to-purple-600"
    },
    {
        icon: Users,
        label: "Declining Agents",
        prompt: "Which agents have declining scores recently?",
        color: "from-rose-500 to-pink-600"
    },
    {
        icon: Calendar,
        label: "Today's Activity",
        prompt: "What's the call activity summary for today?",
        color: "from-cyan-500 to-blue-600"
    },
    {
        icon: Mail,
        label: "Email Report",
        prompt: "Generate and email a compliance report",
        color: "from-blue-600 to-indigo-600"
    }
];

export function AuraChat() {
    const { profile, user } = useAuth();
    const { openVoice, closeVoice } = useVoice();
    const { isConnected, disconnect } = useGeminiLive();
    const resolvedUserId = profile?.id || user?.uid;
    // Use the shared hook for avatar, name, and email resolution
    const { avatarUrl, displayName: userName, email: userEmail, slackId } = useUserSettings();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [showRecipientSelector, setShowRecipientSelector] = useState(false);
    const [recipientNames, setRecipientNames] = useState<Record<string, string>>({});

    // Employee Search State
    const [showEmployeeSearch, setShowEmployeeSearch] = useState(false);
    const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
    const [employeeSearchResults, setEmployeeSearchResults] = useState<{ email: string; name: string; role: string }[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Chat History State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch Recipient Names for Chips
    useEffect(() => {
        const fetchRecipientNames = async () => {
            const roles = ['President', 'CTO', 'Manager', 'Team Lead'];
            const names: Record<string, string> = {};

            for (const role of roles) {
                const { data } = await supabase
                    .from('employee_directory')
                    .select('first_name, last_name')
                    .ilike('role', `%${role}%`)
                    .limit(1)
                    .maybeSingle();

                if (data) {
                    names[role.toLowerCase()] = `${data.first_name} ${data.last_name}`;
                }
            }
            setRecipientNames(names);
        };
        fetchRecipientNames();
    }, []);

    // Search Employee Directory
    const searchEmployees = useCallback(async (query: string) => {
        if (!query || query.length < 2) {
            setEmployeeSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const { data, error } = await supabase
                .from('employee_directory')
                .select('email, first_name, last_name, role')
                .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,role.ilike.%${query}%`)
                .limit(10);

            if (error) throw error;

            const results = (data || []).map(emp => ({
                email: emp.email,
                name: `${emp.first_name} ${emp.last_name}`,
                role: emp.role || 'Employee'
            }));
            setEmployeeSearchResults(results);
        } catch (err) {
            console.error('Employee search error:', err);
            setEmployeeSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Debounced search effect
    useEffect(() => {
        if (!showEmployeeSearch) return;
        const timer = setTimeout(() => {
            searchEmployees(employeeSearchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [employeeSearchQuery, showEmployeeSearch, searchEmployees]);


    // Load messages for a session (Web or Slack)
    const loadSession = async (id: string, source: 'web' | 'slack' = 'web') => {
        setIsLoading(true);
        try {
            let loadedMessages: ChatMessage[] = [];

            if (source === 'slack') {
                // Load from Slack Memory
                const { data } = await supabase
                    .from('slack_bot_memory')
                    .select('*')
                    .eq('slack_user_id', slackId) // Ensure we only load for this user
                    //.eq('thread_ts', id) // Future: filter by thread. For now load all recent.
                    .order('created_at', { ascending: true })
                    .limit(50);

                if (data) {
                    loadedMessages = data.flatMap(m => {
                        const msgs: ChatMessage[] = [];
                        if (m.message_in) {
                            msgs.push({
                                id: `slack-in-${m.id}`,
                                role: 'user',
                                content: m.message_in,
                                timestamp: new Date(m.created_at)
                            });
                        }
                        if (m.message_out) {
                            msgs.push({
                                id: `slack-out-${m.id}`,
                                role: 'assistant',
                                content: m.message_out,
                                timestamp: new Date(m.created_at) // Approximate outbound time
                            });
                        }
                        return msgs;
                    });
                }
            } else {
                // Load from Web Chat
                const { data, error } = await supabase
                    .from('chat_messages')
                    .select('*')
                    .eq('session_id', id)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                if (data) {
                    loadedMessages = data.map(m => ({
                        id: m.id,
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                        timestamp: new Date(m.created_at)
                    }));
                }
            }

            setMessages(loadedMessages);
            setSessionId(id);
        } catch (error) {
            console.error('Error loading session:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewChat = () => {
        setMessages([]);
        setSessionId(null);
        setIsSidebarOpen(false);
    };

    // Auto-scroll to bottom
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Track scroll position for "scroll to bottom" button
    const handleScroll = () => {
        if (!messagesContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    };

    // Fetch QA context data
    const fetchQAContext = async (): Promise<string> => {
        try {
            // Fetch comprehensive call data including all details for Aura
            const { data, error } = await supabase
                .from('QA Results')
                .select('id, agent_name, compliance_score, call_score, call_status, risk_level, created_at, campaign_type, summary, transcript, checklist, violations, coaching_notes, review_flags, call_duration')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            // Summarize data for context
            const summary = {
                totalCalls: data?.length || 0,
                avgScore: data?.length
                    ? Math.round(data.reduce((a, c) => a + (Number(c.compliance_score || c.call_score) || 0), 0) / data.length)
                    : 0,
                highRisk: data?.filter(c => c.risk_level?.toLowerCase() === 'high').length || 0,
                agentStats: {} as Record<string, { calls: number; avgScore: number; scores: number[] }>,
                // Include full details for recent calls so Aura can answer specific questions
                recentCallDetails: data?.slice(0, 20).map(c => ({
                    id: c.id,
                    agent: c.agent_name,
                    score: c.compliance_score || c.call_score,
                    status: c.call_status,
                    risk: c.risk_level,
                    date: c.created_at,
                    duration: c.call_duration,
                    campaign: c.campaign_type,
                    summary: c.summary,
                    transcript: c.transcript?.substring(0, 2000), // Truncate to save context
                    violations: c.violations,
                    coaching_notes: c.coaching_notes,
                    // Parse checklist for key insights
                    checklistSummary: typeof c.checklist === 'object'
                        ? Object.entries(c.checklist || {}).map(([key, val]: [string, any]) => ({
                            item: key,
                            status: val?.status,
                            notes: val?.notes
                        }))
                        : c.checklist
                }))
            };

            // Calculate per-agent stats
            data?.forEach(call => {
                const agent = call.agent_name || 'Unknown';
                if (!summary.agentStats[agent]) {
                    summary.agentStats[agent] = { calls: 0, avgScore: 0, scores: [] };
                }
                summary.agentStats[agent].calls++;
                summary.agentStats[agent].scores.push(Number(call.compliance_score || call.call_score) || 0);
            });

            // Calculate averages
            Object.keys(summary.agentStats).forEach(agent => {
                const stats = summary.agentStats[agent];
                stats.avgScore = Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length);
            });

            return JSON.stringify(summary, null, 2);
        } catch (error) {
            console.error('Error fetching QA context:', error);
            return '{"error": "Failed to fetch QA data"}';
        }
    };

    // Send message to API
    const sendMessage = async (content: string) => {
        if (!content.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: content.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        // Add placeholder assistant message
        const assistantId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true
        }]);

        try {
            // 1. Ensure Session Exists
            let currentSessionId = sessionId;
            // Priority: email-based UUID (always valid format) > profile.id (if it looks like UUID)
            // Firebase UID is NOT a valid UUID, so we never use it directly
            const isValidUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

            // Debug: Log identity resolution
            console.log('[AuraChat] Identity check:', { userEmail, resolvedUserId, currentSessionId });

            const userIdentifier = userEmail
                ? generateUuidFromEmail(userEmail)
                : (resolvedUserId && isValidUuid(resolvedUserId) ? resolvedUserId : null);

            if (!currentSessionId && userIdentifier) {
                console.log('[AuraChat] Creating new session for user:', userIdentifier, '(from:', userEmail ? 'email' : 'profile', ')');

                // Use two-step approach for better error diagnosis
                const { data: session, error, status, statusText } = await supabase
                    .from('chat_sessions')
                    .insert({
                        user_id: userIdentifier,
                        title: content.slice(0, 30) + (content.length > 30 ? '...' : '')
                    })
                    .select()
                    .maybeSingle();

                if (error) {
                    // Log full error with status info
                    console.warn('[AuraChat] Session creation failed:', {
                        message: error.message || 'Unknown error',
                        code: error.code || 'N/A',
                        hint: error.hint || 'N/A',
                        details: error.details || 'N/A',
                        status,
                        statusText
                    });
                    // Continue without session - chat still works, just won't persist history
                } else if (session) {
                    console.log('[AuraChat] Session created:', session.id);
                    currentSessionId = session.id;
                    setSessionId(session.id);
                } else {
                    // Insert may have succeeded but RLS prevents reading back
                    console.warn('[AuraChat] Session insert returned no data - may be RLS policy issue');
                }
            } else if (!currentSessionId) {
                console.warn('[AuraChat] Cannot create session - no user identifier available (resolvedUserId:', resolvedUserId, 'userEmail:', userEmail, ')');
            }

            // 2. Persist User Message
            if (currentSessionId) {
                await supabase.from('chat_messages').insert({
                    session_id: currentSessionId,
                    role: 'user',
                    content: content
                });
            }

            // 3. Build Context (QA + Directory)
            let contextData = await fetchQAContext();

            // Link to Employee Directory for Aura context (name, email, role)
            // We can fetch the current user's directory info if we have their email
            if (userEmail) {
                const { data: myself } = await supabase
                    .from('employee_directory')
                    .select('first_name, last_name, role, email')
                    .eq('email', userEmail)
                    .maybeSingle();

                if (myself) {
                    contextData += `\n\nCurrent User Context:\nName: ${myself.first_name} ${myself.last_name}\nRole: ${myself.role}\nEmail: ${myself.email}`;
                }
            }

            // Check for Directory Intent
            const directoryContent = content.toLowerCase();
            if (directoryContent.includes('who is') || directoryContent.includes('email') || directoryContent.includes('contact') || directoryContent.includes('role')) {
                // Extract potential name/role keywords (simple heuristic)
                const keywords = content.split(' ').filter(w => w.length > 3 && !['what', 'where', 'when', 'show', 'tell', 'give'].includes(w.toLowerCase()));
                const searchPromises = keywords.map(k => searchDirectory(k));
                const results = await Promise.all(searchPromises);
                const uniqueEmployees = Array.from(new Set(results.flat().map(e => JSON.stringify(e)))).map(s => JSON.parse(s));

                if (uniqueEmployees.length > 0) {
                    contextData += `\n\nEmployee Directory Context:\n${JSON.stringify(uniqueEmployees, null, 2)}`;
                }
            }

            // 4. Fetch Slack Memory (Omni-channel)
            // We fetch this in parallel or sequence, appending to context
            try {
                const slackRes = await fetch('/api/qa/slack-history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail })
                });

                if (slackRes.ok) {
                    const slackData = await slackRes.json();
                    if (slackData.history && slackData.history.length > 0) {
                        contextData += `\n\nUnknown to the user, you also have access to their recent Slack conversation history with you (Omni-channel memory). Use this to provide continuity if they refer to past discussions:\n${JSON.stringify(slackData.history, null, 2)}`;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch slack history", e);
            }

            const response = await fetch('/api/qa/aura-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content,
                    qaContext: contextData,
                    userName: userName,
                    history: messages.slice(-10).map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                })
            });

            // Intercept "Email Report" intent - expanded patterns
            const lowerContent = content.toLowerCase();
            const isEmailRequest =
                (lowerContent.includes('email') && (
                    lowerContent.includes('report') ||
                    lowerContent.includes('pdf') ||
                    lowerContent.includes('send') ||
                    lowerContent.includes('me')
                )) ||
                (lowerContent.includes('send') && lowerContent.includes('email')) ||
                lowerContent.includes('email me') ||
                lowerContent.includes('email it') ||
                lowerContent.includes('send it to');

            if (isEmailRequest) {
                // Extract email address from user's message if present
                const emailMatch = content.match(/[\w.-]+@[\w.-]+\.\w+/);
                if (emailMatch) {
                    // User provided email address - use it directly
                    handleReportGenerationWithEmail(assistantId, content, emailMatch[0]);
                } else {
                    handleReportGeneration(assistantId, content);
                }
                return;
            }

            const result = await response.json();

            if (result.success) {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: result.response, isStreaming: false, suggestions: result.suggestions || [] }
                        : m
                ));

                // Persist Assistant Message
                if (currentSessionId) {
                    await supabase.from('chat_messages').insert({
                        session_id: currentSessionId,
                        role: 'assistant',
                        content: result.response
                    });
                }

            } else {
                console.error('Aura chat API error:', result.error || 'Unknown error');
                setMessages(prev => prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: result.error || 'Sorry, I encountered an error. Please try again.', isStreaming: false }
                        : m
                ));
            }
        } catch (error) {
            console.error('Aura chat error:', error);
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: 'Sorry, I encountered an error. Please try again.', isStreaming: false }
                    : m
            ));
        } finally {
            setIsLoading(false);
        }
    };

    // Handle Report Generation with explicit email address
    const handleReportGenerationWithEmail = async (assistantId: string, prompt: string, email: string) => {
        try {
            // Detect tag filter from prompt
            const lowerPrompt = prompt.toLowerCase();
            let tagFilter: 'escalated' | 'training_review' | 'audit_list' | null = null;
            let tagLabel = '';

            if (lowerPrompt.includes('escalat')) {
                tagFilter = 'escalated';
                tagLabel = 'Escalated Calls';
            } else if (lowerPrompt.includes('training')) {
                tagFilter = 'training_review';
                tagLabel = 'Training Review';
            } else if (lowerPrompt.includes('audit')) {
                tagFilter = 'audit_list';
                tagLabel = 'Audit List';
            }

            const statusMsg = tagFilter
                ? `Generating ${tagLabel} report and sending to ${email}...`
                : `Sending the report to ${email}...`;

            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: statusMsg, isStreaming: false }
                    : m
            ));

            // Fetch QA data with optional tag filter
            let query = supabase
                .from('QA Results')
                .select('*')
                .order('created_at', { ascending: false });

            if (tagFilter) {
                query = query.eq('tag', tagFilter);
            }

            const { data, error } = await query.limit(50);

            if (error) throw error;

            const calls = (data || []).map(transformRow);

            if (tagFilter && calls.length === 0) {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: `I couldn't find any calls with the "${tagLabel}" tag. Would you like me to send the full report instead?`, isStreaming: false }
                        : m
                ));
                return;
            }

            // Generate PDF with appropriate title
            const reportTitle = tagFilter
                ? `${tagLabel} Report`
                : 'Aura AI Compliance Summary';

            const doc = await generateQAComplianceReport(calls, {
                title: reportTitle,
                userName: userName,
                dateRange: {
                    start: format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
                    end: format(new Date(), 'yyyy-MM-dd')
                }
            });

            const pdfBlob = doc.output('blob');
            const pdfBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(pdfBlob);
            });

            // Send email via API
            const subjectLine = tagFilter
                ? `${tagLabel} Report - ${format(new Date(), 'MMM dd, yyyy')}`
                : `QA Compliance Report - ${format(new Date(), 'MMM dd, yyyy')}`;

            const emailResponse = await fetch('/api/qa/send-report-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: email,
                    subject: subjectLine,
                    pdfBase64,
                    userName: userName
                })
            });

            const emailResult = await emailResponse.json();

            if (emailResult.success) {
                const successMsg = tagFilter
                    ? `Done! I've sent the ${tagLabel} report (${calls.length} calls) to ${email}. Is there anything else you'd like me to look into, or would you like me to send a different report?`
                    : `Done! I've sent the compliance report to ${email}. Check your inbox. Would you like me to break down any specific agent's performance, or should I send this to anyone else?`;

                setMessages(prev => prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: successMsg, isStreaming: false }
                        : m
                ));
            } else {
                throw new Error(emailResult.error || 'Email failed');
            }
        } catch (err: any) {
            console.error('Email report error:', err);
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: `I ran into an issue sending the email: ${err.message}. Let me know if you'd like to try again.`, isStreaming: false }
                    : m
            ));
        }
    };

    // Handle Report Generation and Email
    const handleReportGeneration = async (assistantId: string, customPrompt: string = "") => {
        try {
            // 1. Identify Recipient
            let recipientEmail: string | null | undefined = null;
            let recipientName = "You";

            // Check for explicit targets in the prompt logic
            // Simple heuristic to extract target from "email [target] report"
            // This is basic; a real implementation would use NLP or distinct UI
            const lowerPrompt = customPrompt.toLowerCase();
            let targetName = "";

            if (lowerPrompt.includes("me") || lowerPrompt.includes("myself")) {
                recipientEmail = userEmail;
            }
            else if (lowerPrompt.includes("cto")) targetName = "cto";
            else if (lowerPrompt.includes("manager")) targetName = "manager";
            else if (lowerPrompt.includes("lead")) targetName = "team lead";
            else if (lowerPrompt.includes("owner")) targetName = "owner";
            else if (lowerPrompt.includes("president")) targetName = "president";

            if (targetName) {
                const { findBestMatchEmployee } = await import("@/utils/directory-utils");
                const targetEmployee = await findBestMatchEmployee(targetName);
                if (targetEmployee?.email) {
                    recipientEmail = targetEmployee.email;
                    recipientName = `${targetEmployee.first_name} (${targetEmployee.role})`;
                }
            }

            // 1.5 Handle Clarification/Confirmation
            // Improved detection: if we already identified a recipient, or if "to [role]" is present
            const isExplicitTarget =
                recipientEmail !== null ||
                targetName !== "" ||
                lowerPrompt.includes("to me") ||
                lowerPrompt.includes("to manager") ||
                lowerPrompt.includes("to cto") ||
                lowerPrompt.includes("to done") ||
                lowerPrompt.includes("to team lead") ||
                lowerPrompt.includes("to president") ||
                // Catch cases like "to the President" or "to my Manager"
                /to (the |my )?(manager|cto|president|lead|me)/i.test(lowerPrompt);

            // If it's the initial generic "Generate and email a compliance report" 
            // WITHOUT an explicit recipient, default to "Me" but follow up with chips.
            if (!isExplicitTarget) {
                if (customPrompt === "Generate and email a compliance report") {
                    recipientEmail = userEmail;
                    recipientName = "You";
                } else {
                    setMessages(prev => prev.map(m =>
                        m.id === assistantId
                            ? { ...m, content: "I can definitely generate that report for you. Who should I email it to?", isStreaming: false }
                            : m
                    ));
                    setShowRecipientSelector(true);
                    return;
                }
            }

            // Fallback for "me" if recipientEmail is still null (e.g. no auth)
            if (!recipientEmail && !lowerPrompt.includes("done")) {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId
                        ? { ...m, content: "I couldn't find an email address linked to your account. Who else should I send it to?", isStreaming: false }
                        : m
                ));
                setShowRecipientSelector(true);
                return;
            }

            // 2. Fetch Calls
            const { data, error } = await supabase
                .from('QA Results')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error || !data) throw new Error('Failed to fetch data');

            const calls = data.map(transformRow);

            // 3. Generate PDF
            const doc = await generateQAComplianceReport(calls, {
                title: "Aura AI Compliance Summary",
                userName: userName,
                dateRange: { start: format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }
            });

            // 4. Send Email
            const pdfDataUri = doc.output('datauristring');
            const base64Data = pdfDataUri.split(',')[1];

            // Construct Subject Line: [Title] - [First Name]
            // Extract First Name from userName (e.g. "John Doe" -> "John")
            const firstName = userName.split(' ')[0] || 'User';
            const subjectLine = `Compliance Report - ${firstName}`;

            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: recipientEmail,
                    subject: subjectLine,
                    text: `Hey ${firstName}, here is the compliance report you asked for. I put together all the key metrics and insights for you. If you want me to look into anything specific or need anything else, just let me know. Aura`,
                    html: `
                        <div style="font-family: Verdana, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                                Hey ${firstName},
                            </p>
                            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                                Here is the compliance report you asked for. I put together all the key metrics and insights for you, everything from agent performance to risk flags.
                            </p>
                            <p style="font-size: 14px; color: #212121; line-height: 1.6; margin-bottom: 8px;">
                                <strong>Attachment:</strong> compliance_report.pdf
                            </p>
                            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                                If you want me to look into anything specific or need anything else, just let me know.
                            </p>
                            
                            <!-- Aura AI Signature -->
                            <div dir="ltr" style="margin-top: 40px;">
                                <table style="direction:ltr;border-collapse:collapse;">
                                    <tr><td style="font-size:0;height:40px;line-height:0;"></td></tr>
                                    <tr><td>
                                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;" width="100%">
                                            <tr><td>
                                                <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;line-height:normal;">
                                                    <tr><td height="0" style="height:0;font-family:Verdana;text-align:left">
                                                        <p style="margin:1px;"><img style="height:57px" src="https://d36urhup7zbd7q.cloudfront.net/5566372452040704/no_sig_176896621427/signoff.gif?ck=1768966214.27" alt="Kind regards," height="57"></p>
                                                    </td></tr>
                                                </table>
                                            </td></tr>
                                            <tr><td height="0" style="height:0;line-height:1%;padding-top:16px;font-size:1px;"></td></tr>
                                            <tr><td>
                                                <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;line-height:1.15;">
                                                    <tr>
                                                        <td style="height:1px;width:110px;vertical-align:middle;padding:.01px 1px;">
                                                            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                                <tr><td style="vertical-align:middle;padding:.01px 1px 18px 0.01px;width:96px;text-align:center;">
                                                                    <img border="0" src="https://gifo.srv.wisestamp.com/im/sh/dS9Rb2VKUW5lcFliRS84NzllOTYzNS04YjNmLTQ1MmQtOWZiYy01YjdjMjA5ODA2MzVfXzQwMHg0MDBfXy5qcGVnI2xvZ28=/circle.png" height="96" width="96" alt="photo" style="width:96px;vertical-align:middle;border-radius:50%;height:96px;border:0;display:block;">
                                                                </td></tr>
                                                                <tr><td style="vertical-align:bottom;padding:.01px;width:110px;text-align:center;">
                                                                    <img border="0" src="https://d36urhup7zbd7q.cloudfront.net/u/QoeJQnepYbE/4ff815de-d8f2-4c40-a393-59ba331d1f95__400x200__.jpeg" height="55" width="110" alt="photo" style="width:110px;vertical-align:middle;border-radius:0;height:55px;border:0;display:block;">
                                                                </td></tr>
                                                            </table>
                                                        </td>
                                                        <td valign="top" style="padding:.01px 0.01px 0.01px 18px;vertical-align:top;">
                                                            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                                <tr><td style="line-height:132.0%;font-size:18px;padding-bottom:18px;">
                                                                    <p style="margin:.1px;line-height:132.0%;font-size:18px;">
                                                                        <span style="font-family:Verdana;font-size:18px;font-weight:bold;color:#953DB8;letter-spacing:0;white-space:nowrap;">Aura AI</span><br>
                                                                        <span style="font-family:Verdana;font-size:14px;font-weight:bold;color:#212121;white-space:nowrap;">Support Specialist,&nbsp;</span>
                                                                        <span style="font-family:Verdana;font-size:14px;font-weight:bold;color:#212121;white-space:nowrap;">Pitch Perfect Solutions</span>
                                                                    </p>
                                                                </td></tr>
                                                                <tr><td style="padding:.01px 0.01px 18px 0.01px;border-bottom:solid 5px #953DB8;border-top:solid 5px #953DB8;">
                                                                    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
                                                                        <tr><td nowrap width="235" height="0" style="height:0;padding-top:18px;white-space:nowrap;width:235px;font-family:Verdana;">
                                                                            <p style="margin:1px;line-height:99%;font-size:12px;">
                                                                                <span style="white-space:nowrap;">
                                                                                    <img src="https://gifo.srv.wisestamp.com/s/rfw1/953DB8/26/trans.png" style="line-height:120%;width:12px;" width="12" alt="icon">&nbsp;
                                                                                    <a href="https://pitchperfectsolutions.com/" target="_blank" style="font-family:Verdana;text-decoration:unset;" rel="nofollow noreferrer">
                                                                                        <span style="line-height:120%;font-family:Verdana;font-size:12px;color:#212121;white-space:nowrap;">pitchperfectsolutions.com/</span>
                                                                                    </a>
                                                                                </span>
                                                                            </p>
                                                                        </td></tr>
                                                                        <tr><td nowrap width="295" height="0" style="height:0;padding-top:10px;white-space:nowrap;width:295px;font-family:Verdana;">
                                                                            <p style="margin:1px;line-height:99%;font-size:12px;">
                                                                                <span style="white-space:nowrap;">
                                                                                    <img src="https://gifo.srv.wisestamp.com/s/rfem1/953DB8/26/trans.png" style="line-height:120%;width:12px;" width="12" alt="icon">&nbsp;
                                                                                    <a href="mailto:reports@pitchperfectsolutions.net" target="_blank" style="font-family:Verdana;text-decoration:unset;" rel="nofollow noreferrer">
                                                                                        <span style="line-height:120%;font-family:Verdana;font-size:12px;color:#212121;white-space:nowrap;">reports@pitchperfectsolutions.net</span>
                                                                                    </a>
                                                                                </span>
                                                                            </p>
                                                                        </td></tr>
                                                                    </table>
                                                                </td></tr>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td></tr>
                                            <tr><td height="0" style="height:0;line-height:1%;padding-top:16px;font-size:1px;"></td></tr>
                                            <tr><td>
                                                <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;color:gray;border-top:1px solid gray;line-height:normal;">
                                                    <tr><td height="0" style="height:0;padding:9px 8px 0 0;">
                                                        <p style="color:#888888;text-align:left;font-size:10px;margin:1px;line-height:120%;font-family:Verdana">IMPORTANT: The contents of this email and any attachments are confidential. They are intended for the named recipient(s) only. If you have received this email by mistake, please notify the sender immediately and do not disclose the contents to anyone or make copies thereof.</p>
                                                    </td></tr>
                                                </table>
                                            </td></tr>
                                        </table>
                                    </td></tr>
                                </table>
                            </div>
                        </div>
                    `,
                    attachments: [{
                        filename: 'compliance_report.pdf',
                        content: base64Data,
                        encoding: 'base64'
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Email sending failed');
            }

            // 5. Update UI
            const isMe = recipientName === "You";
            const successMsg = isMe
                ? `I've generated the report and emailed a copy to you (${recipientEmail}). Is there anyone else that I should include?`
                : `I've generated the report and emailed it to **${recipientName}** (${recipientEmail}). Should I include anyone else?`;

            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: successMsg, isStreaming: false }
                    : m
            ));

            setShowRecipientSelector(true);

            // Persist the success message
            if (sessionId) {
                await supabase.from('chat_messages').insert({
                    session_id: sessionId,
                    role: 'assistant',
                    content: successMsg
                });
            }

        } catch (error: any) {
            console.error('Report generation failed:', error);
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: `I'm sorry, I was unable to generate and send the report. Error details: ${error.message || 'Unknown error'}`, isStreaming: false }
                    : m
            ));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const handlePrePrompt = (prompt: string) => {
        sendMessage(prompt);
    };

    const handleRecipientSelect = (role: string) => {
        setShowRecipientSelector(false);
        const prompt = `Email report to ${role}`;
        sendMessage(prompt);
    };



    return (
        <>


            {/* Main Chat Layout - Full Height relative to container */}
            {/* Added negative margins to break out of DashboardLayout padding (p-8 pb-20) */}
            <div className="flex flex-col min-h-[calc(100vh-5rem)] -m-8 -mb-20 px-8 pt-6 relative">

                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-shrink-0 relative">
                    <div className="flex items-center gap-4">
                        <div className="relative" onClick={() => setIsSidebarOpen(true)}>
                            <div className="w-14 h-14 rounded-full overflow-hidden shadow-2xl shadow-purple-500/30 border-2 border-white/20 cursor-pointer hover:border-indigo-400 transition-colors">
                                <Image
                                    src="/aura-avatar.png"
                                    alt="Aura"
                                    width={56}
                                    height={56}
                                    className="object-cover w-full h-full"
                                    unoptimized
                                />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-black rounded-full" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                Aura
                                <span className="text-xs font-semibold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-300 bg-white/5 border border-indigo-500/30 px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                                    AI Assistant
                                </span>
                            </h2>
                            <p className="text-white/90 text-sm">
                                Ask me anything about your QA data and analytics
                            </p>
                        </div>
                    </div>
                    {/* History Toggle */}
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40 rounded-lg text-indigo-300 hover:text-indigo-200 transition-all group"
                    >
                        <History size={18} className="group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">History</span>
                    </button>
                    <ChatSidebar
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                        currentSessionId={sessionId}
                        onSelectSession={loadSession}
                        onNewChat={handleNewChat}
                        slackId={slackId}
                        userId={resolvedUserId}
                        userEmail={userEmail}
                    />
                </div>

                {/* Chat Container - Takes remaining space */}
                <div className="flex-1 flex flex-col glass-card rounded-2xl border border-white/10 overflow-hidden min-h-0">
                    {/* Messages Area */}
                    <div
                        ref={messagesContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto p-6 space-y-4"
                    >
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center h-full text-center pt-12 px-6 scale-95 md:scale-100 transition-transform">
                                <div className="w-24 h-24 rounded-full overflow-hidden mb-6 border-2 border-white/20 shadow-xl shadow-indigo-500/20">
                                    <Image
                                        src="/aura-avatar.png"
                                        alt="Aura"
                                        width={96}
                                        height={96}
                                        className="object-cover w-full h-full"
                                        unoptimized
                                    />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">
                                    Hey {userName?.split(' ')[0]}!
                                </h3>
                                <p className="text-white/70 text-sm max-w-md mb-8">
                                    I'm Aura, your personal QA insights assistant. I can help you understand compliance scores,
                                    spot trends, and keep track of agent performance. What would you like to know?
                                </p>

                                {/* Pre-prompt Chips */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
                                    {PRE_PROMPTS.map((prompt, i) => (
                                        <motion.button
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            onClick={() => handlePrePrompt(prompt.prompt)}
                                            className="group flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all text-left"
                                        >
                                            <div className={`p-2 rounded-lg bg-gradient-to-br ${prompt.color} opacity-80 group-hover:opacity-100 transition-opacity`}>
                                                <prompt.icon size={16} className="text-white" />
                                            </div>
                                            <span className="text-white/80 group-hover:text-white text-sm font-medium transition-colors">
                                                {prompt.label}
                                            </span>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <>
                                {messages.map((message, index) => {
                                    const showDateDivider = index === 0 ||
                                        format(message.timestamp, 'yyyy-MM-dd') !== format(messages[index - 1].timestamp, 'yyyy-MM-dd');

                                    return (
                                        <Fragment key={message.id}>
                                            {showDateDivider && (
                                                <div className="flex justify-center my-6">
                                                    <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-white/40 uppercase tracking-widest font-semibold">
                                                        {isToday(message.timestamp) ? 'Today' :
                                                            isYesterday(message.timestamp) ? 'Yesterday' :
                                                                format(message.timestamp, 'MMMM d, yyyy')}
                                                    </span>
                                                </div>
                                            )}
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}
                                            >
                                                {message.role === 'assistant' && (
                                                    <div className="w-9 h-9 rounded-xl overflow-hidden mr-3 flex-shrink-0 mt-1 border border-white/20">
                                                        <Image
                                                            src="/aura-avatar.png"
                                                            alt="Aura"
                                                            width={36}
                                                            height={36}
                                                            className="object-cover w-full h-full"
                                                            unoptimized
                                                        />
                                                    </div>
                                                )}

                                                {message.isStreaming ? (
                                                    <div className="-ml-3 mt-1">
                                                        <TypingBubble />
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col max-w-[75%]">
                                                        <div
                                                            className={`px-4 py-2.5 text-[15px] shadow-sm transition-all duration-300 ${message.role === 'user'
                                                                ? 'bg-[#007AFF] text-white rounded-[18px] rounded-br-[4px] shadow-blue-900/20'
                                                                : 'bg-[#262628] border border-white/10 text-white rounded-[18px] rounded-bl-[4px] shadow-black/20'
                                                                }`}
                                                        >
                                                            <div className="whitespace-pre-wrap leading-relaxed break-words">
                                                                {message.content}
                                                            </div>
                                                        </div>
                                                        <div className={`text-[10px] mt-1.5 px-1 ${message.role === 'user' ? 'text-white/40 text-right' : 'text-white/30 text-left'}`}>
                                                            {format(message.timestamp, isToday(message.timestamp) ? 'h:mm a' : 'MMM d, h:mm a')}
                                                        </div>

                                                        {/* Suggestion Chips - Only for assistant messages with suggestions */}
                                                        {message.role === 'assistant' && message.suggestions && message.suggestions.length > 0 && (
                                                            <div className="flex flex-wrap gap-2 mt-3 ml-1">
                                                                {message.suggestions.map((suggestion, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={() => sendMessage(suggestion)}
                                                                        disabled={isLoading}
                                                                        className="group relative px-4 py-2 text-xs font-semibold rounded-full transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    >
                                                                        {/* Solid dark background - never lightens */}
                                                                        <span className="absolute inset-0 rounded-full bg-black/80" />

                                                                        {/* Border that glows on hover */}
                                                                        <span className="absolute inset-0 rounded-full border border-indigo-500/40 group-hover:border-indigo-400/70 group-hover:shadow-[0_0_12px_rgba(129,140,248,0.4)] transition-all duration-300" />

                                                                        {/* Text - bright on hover */}
                                                                        <span className="relative z-10 flex items-center gap-1.5 text-slate-300 group-hover:text-white transition-colors duration-200">
                                                                            <Zap size={12} className="text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                                                                            {suggestion}
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {message.role === 'user' && (
                                                    <div className="w-9 h-9 rounded-full overflow-hidden ml-3 flex-shrink-0 mt-auto mb-1 shadow-lg shadow-black/40 border border-white/10">
                                                        {avatarUrl ? (
                                                            <Image
                                                                src={avatarUrl}
                                                                alt="You"
                                                                width={36}
                                                                height={36}
                                                                className="object-cover w-full h-full"
                                                                unoptimized
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                                                {(userName || 'U')[0]?.toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </motion.div>
                                        </Fragment>
                                    );
                                })}



                                {/* Recipient Selection Chips */}
                                {showRecipientSelector && (
                                    <div className="flex flex-col gap-3 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-32">
                                        <p className="text-sm text-white/60">Select a recipient:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { label: 'Manager', role: 'my Manager', icon: Users, key: 'manager' },
                                                { label: 'Team Lead', role: 'the Team Lead', icon: Users, key: 'team lead' },
                                                { label: 'CTO', role: 'the CTO', icon: Users, key: 'cto' },
                                                { label: 'President', role: 'the President', icon: Users, key: 'president' },
                                                { label: 'Search', role: 'search', icon: Search },
                                                { label: "No, I'm done", role: 'done', icon: Check },
                                            ]
                                                .filter(opt => {
                                                    // Filter out roles that match the current user (to avoid redundant options)
                                                    if (opt.key && recipientNames[opt.key]) {
                                                        const roleName = recipientNames[opt.key].toLowerCase();
                                                        const currentUserName = (userName || '').toLowerCase();
                                                        if (roleName.includes(currentUserName) || currentUserName.includes(roleName.split(' ')[0])) {
                                                            return false; // Exclude this option
                                                        }
                                                    }
                                                    return true;
                                                })
                                                .map((opt, i) => {
                                                    const name = opt.key ? recipientNames[opt.key] : null;
                                                    const label = name ? `${opt.label} - ${name}` : opt.label;

                                                    return (
                                                        <button
                                                            key={i}
                                                            onClick={() => {
                                                                if (opt.role === 'done') {
                                                                    setShowRecipientSelector(false);
                                                                    setShowEmployeeSearch(false);
                                                                } else if (opt.role === 'search') {
                                                                    setShowEmployeeSearch(!showEmployeeSearch);
                                                                    setEmployeeSearchQuery('');
                                                                    setEmployeeSearchResults([]);
                                                                } else {
                                                                    handleRecipientSelect(opt.role);
                                                                }
                                                            }}
                                                            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-all ${opt.role === 'done'
                                                                ? 'bg-white/5 hover:bg-white/10 border-white/20 text-white/60'
                                                                : opt.role === 'search' && showEmployeeSearch
                                                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                                                    : 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-500/30 hover:border-indigo-500/50 text-white/90 hover:text-white'
                                                                }`}
                                                        >
                                                            <opt.icon size={14} />
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                        </div>

                                        {/* Employee Search UI */}
                                        {showEmployeeSearch && (
                                            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="relative mb-3">
                                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                                                    <input
                                                        type="text"
                                                        value={employeeSearchQuery}
                                                        onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                                                        placeholder="Search by name, email, or role..."
                                                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                                                        autoFocus
                                                    />
                                                </div>

                                                {/* Search Results */}
                                                {isSearching ? (
                                                    <div className="flex items-center justify-center py-4 text-white/40 text-sm">
                                                        <Loader2 size={16} className="animate-spin mr-2" />
                                                        Searching...
                                                    </div>
                                                ) : employeeSearchResults.length > 0 ? (
                                                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                                                        {employeeSearchResults.map((emp, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => {
                                                                    handleRecipientSelect(`email: ${emp.email}`);
                                                                    setShowEmployeeSearch(false);
                                                                    setEmployeeSearchQuery('');
                                                                }}
                                                                className="flex items-center justify-between p-3 bg-white/5 hover:bg-indigo-500/20 border border-white/10 hover:border-indigo-500/30 rounded-lg text-left transition-all"
                                                            >
                                                                <div>
                                                                    <p className="text-sm text-white font-medium">{emp.name}</p>
                                                                    <p className="text-xs text-white/50">{emp.email}</p>
                                                                </div>
                                                                <span className="text-xs px-2 py-1 bg-white/10 rounded text-white/60">{emp.role}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : employeeSearchQuery.length >= 2 ? (
                                                    <div className="text-center text-white/40 text-sm py-4">
                                                        No employees found
                                                    </div>
                                                ) : (
                                                    <div className="text-center text-white/40 text-sm py-4">
                                                        Type at least 2 characters to search
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                        <div ref={messagesEndRef} className="h-32" />{/* Spacer for fixed input */}
                    </div>

                    {/* Scroll to bottom button */}
                    <AnimatePresence>
                        {showScrollButton && (
                            <motion.button
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                onClick={scrollToBottom}
                                className="absolute bottom-32 right-8 p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-lg shadow-indigo-900/50 transition-colors z-30"
                            >
                                <ChevronDown size={20} className="text-white" />
                            </motion.button>
                        )}
                    </AnimatePresence>

                    {/* Input Area rendered via Portal to escape motion.div containment */}
                </div>
            </div >

            {/* Portal: Input Area - Fixed to align with Sidebar Sign Out */}
            {typeof window !== 'undefined' && createPortal(
                <form
                    onSubmit={handleSubmit}
                    className="fixed bottom-4 left-[calc(18rem+2rem)] right-8 z-50 bg-[#050505]/90 backdrop-blur-xl border border-white/5 rounded-2xl p-4 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            {/* Subtle luminous border - Thinner & refined */}
                            <motion.div
                                className="absolute -inset-[1px] rounded-lg"
                                animate={{
                                    boxShadow: [
                                        "0 0 4px 1px rgba(99, 102, 241, 0.4), inset 0 0 4px 1px rgba(99, 102, 241, 0.1)",
                                        "0 0 8px 1px rgba(168, 85, 247, 0.5), inset 0 0 6px 1px rgba(168, 85, 247, 0.15)",
                                        "0 0 4px 1px rgba(99, 102, 241, 0.4), inset 0 0 4px 1px rgba(99, 102, 241, 0.1)"
                                    ]
                                }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            />

                            <div className="relative rounded-xl overflow-hidden bg-[#0d0e12] border border-white/10">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask Aura about your QA data..."
                                    disabled={isLoading}
                                    className="w-full px-4 py-3 bg-transparent border-none text-white text-sm placeholder-white/40 focus:outline-none transition-all disabled:opacity-50"
                                    style={{ minHeight: '44px' }}
                                />
                            </div>
                        </div>

                        {/* Actions Group */}
                        <div className="flex items-center gap-3">
                            {/* Voice Orb Button - Dynamic State */}
                            <motion.button
                                type="button"
                                onClick={() => {
                                    if (isConnected) {
                                        // End the call
                                        disconnect();
                                        closeVoice();
                                    } else {
                                        // Start the call
                                        openVoice({
                                            qaContext: "",
                                            userName: userName,
                                            conversationHistory: messages.slice(-10).map(m => ({
                                                role: m.role,
                                                content: m.content
                                            }))
                                        });
                                    }
                                }}
                                whileHover={{ scale: 1.08 }}
                                whileTap={{ scale: 0.95 }}
                                className={`relative w-11 h-11 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 group`}
                                title={isConnected ? "End Call" : "Talk to Aura"}
                            >
                                {isConnected ? (
                                    /* End Call State - Red */
                                    <>
                                        {/* Outer Glow Ring - Red Pulsing */}
                                        <motion.div
                                            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute inset-0 bg-gradient-to-br from-rose-500 to-red-600 rounded-full blur-[3px]"
                                        />
                                        {/* Dark Core */}
                                        <div className="absolute inset-0.5 bg-rose-950 rounded-full border border-rose-500/30 flex items-center justify-center">
                                            <PhoneOff className="w-5 h-5 text-rose-400" />
                                        </div>
                                        {/* Active Indicator */}
                                        <motion.span
                                            animate={{ opacity: [1, 0.5, 1] }}
                                            transition={{ duration: 0.8, repeat: Infinity }}
                                            className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-rose-500 border border-black rounded-full z-10"
                                        />
                                    </>
                                ) : (
                                    /* Start Call State - Purple */
                                    <>
                                        {/* Outer Glow Ring */}
                                        <motion.div
                                            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
                                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full blur-[3px]"
                                        />
                                        {/* Dark Core */}
                                        <div className="absolute inset-0.5 bg-black rounded-full border border-white/10 flex items-center justify-center">
                                            <Mic className="w-5 h-5 text-purple-400" />
                                        </div>
                                        {/* Online Dot */}
                                        <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 border border-black rounded-full z-10" />
                                    </>
                                )}
                            </motion.button>

                            {/* Send button - Simple & Sleek */}
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 disabled:opacity-50 rounded-full text-white transition-all shadow-lg shadow-black/20 flex-shrink-0 flex items-center justify-center group"
                            >
                                {isLoading ? (
                                    <Loader2 size={18} className="animate-spin text-white/50" />
                                ) : (
                                    <Send size={18} className="text-white/70 group-hover:text-white transition-colors ml-0.5" />
                                )}
                            </button>
                        </div>
                    </div>
                </form>,
                document.body
            )}

            {/* Aura Voice Modal */}
            {/* Voice modal removed, replaced by global widget */}
        </>
    );
}
