"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { MessageSquare, Plus, Trash2, X, Slack, Search } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface ChatSession {
    id: string;
    title: string | null;
    created_at: string;
    source: 'web' | 'slack';
}

interface ChatSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    currentSessionId: string | null;
    onSelectSession: (sessionId: string, source?: 'web' | 'slack') => void;
    onNewChat: () => void;
    slackId?: string | null;
    userId?: string | null;
    userEmail?: string | null;
}

export function ChatSidebar({ isOpen, onClose, currentSessionId, onSelectSession, onNewChat, slackId, userId, userEmail }: ChatSidebarProps) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'history' | 'search'>('history');

    // Filter sessions based on search query
    const filteredSessions = sessions.filter(session =>
        session.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        searchQuery === ''
    );

    const fetchSessions = async () => {
        setIsLoading(true);
        try {
            console.log('[ChatSidebar] Fetching sessions with:', { userId, userEmail, slackId });

            // Generate deterministic UUID from email if needed
            const generateUuidFromEmail = (email: string): string => {
                let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
                for (let i = 0; i < email.length; i++) {
                    const ch = email.charCodeAt(i);
                    h1 = Math.imul(h1 ^ ch, 2654435761);
                    h2 = Math.imul(h2 ^ ch, 1597334677);
                }
                h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
                h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
                const hex1 = ((h1 >>> 0) & 0xffffffff).toString(16).padStart(8, '0');
                const hex2 = ((h2 >>> 0) & 0xffffffff).toString(16).padStart(8, '0');
                return `${hex1}-${hex2.slice(0, 4)}-4${hex2.slice(4, 7)}-a${hex1.slice(1, 4)}-${hex2}${hex1.slice(0, 4)}`.slice(0, 36);
            };

            // Priority: email-based UUID (always valid format) > userId (if valid UUID)
            // This MUST match the logic in AuraChat.tsx sendMessage for consistency
            const isValidUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
            const userIdentifier = userEmail
                ? generateUuidFromEmail(userEmail)
                : (userId && isValidUuid(userId) ? userId : null);
            console.log('[ChatSidebar] User identifier:', userIdentifier, '(from:', userEmail ? 'email' : 'userId', ')');

            let webData: any[] = [];
            let webError: any = null;

            if (userIdentifier) {
                // Try to find sessions for this specific user
                const result = await supabase
                    .from('chat_sessions')
                    .select('*')
                    .eq('user_id', userIdentifier)
                    .order('created_at', { ascending: false })
                    .limit(20);
                webData = result.data || [];
                webError = result.error;
                console.log('[ChatSidebar] User-specific sessions:', { count: webData.length, error: webError });
            }

            // If no user-specific sessions found, try loading recent sessions (for debugging/recovery)
            if (webData.length === 0 && !webError) {
                console.log('[ChatSidebar] No user sessions found, trying to fetch recent sessions...');
                const recentResult = await supabase
                    .from('chat_sessions')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (recentResult.data && recentResult.data.length > 0) {
                    console.log('[ChatSidebar] Found recent sessions (may not belong to current user):', recentResult.data.length);
                    // Only show these if we have no user identifier (development mode)
                    if (!userIdentifier) {
                        webData = recentResult.data;
                    }
                }
            }

            console.log('[ChatSidebar] Final web sessions:', { webData, webError, count: webData?.length || 0 });

            const webSessions: ChatSession[] = (webData || []).map(s => ({ ...s, source: 'web' }));

            // 2. Fetch Slack Context (Simulated Sessions)
            // We group Slack messages by date to create "Virtual Sessions"
            let slackSessions: ChatSession[] = [];
            if (slackId) {
                const { data: slackData, error: slackError } = await supabase
                    .from('slack_bot_memory')
                    .select('created_at, message_in')
                    .eq('slack_user_id', slackId)
                    .order('created_at', { ascending: false })
                    .limit(50); // Fetch recent 50 messages

                console.log('[ChatSidebar] Slack data response:', { slackData, slackError, count: slackData?.length || 0 });

                if (slackData && slackData.length > 0) {
                    // Create one reliable "Slack History" session for now, 
                    // since grouping by conversation gap is complex without thread_ts
                    slackSessions = [{
                        id: 'slack-history',
                        title: 'Slack Conversation History',
                        created_at: slackData[0].created_at,
                        source: 'slack'
                    }];
                }
            }

            const allSessions = [...slackSessions, ...webSessions];
            console.log('[ChatSidebar] Setting final sessions:', { total: allSessions.length, slack: slackSessions.length, web: webSessions.length });
            setSessions(allSessions);
        } catch (error) {
            console.error('Error fetching chat sessions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchSessions();
        }
    }, [isOpen, slackId]);

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        try {
            const { error } = await supabase
                .from('chat_sessions')
                .delete()
                .eq('id', sessionId);

            if (error) throw error;
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (currentSessionId === sessionId) {
                onNewChat();
            }
        } catch (error) {
            console.error('Error deleting session:', error);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop for click-outside */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9998]"
                    />

                    {/* Popover Menu */}
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="absolute right-0 top-12 w-80 max-h-[600px] bg-[#0f1115]/95 backdrop-blur-xl border border-white/10 z-[9999] flex flex-col shadow-2xl rounded-2xl ring-1 ring-white/5 origin-top-right overflow-hidden"
                    >
                        {/* Header with Tabs */}
                        <div className="border-b border-white/10">
                            <div className="p-4 flex items-center justify-between">
                                <h2 className="font-semibold text-white">Chat History</h2>
                                <button
                                    onClick={onClose}
                                    className="p-1 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex px-4 pb-2 gap-2">
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'history'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <MessageSquare size={14} />
                                    History
                                </button>
                                <button
                                    onClick={() => setActiveTab('search')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${activeTab === 'search'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <Search size={14} />
                                    Search
                                </button>
                            </div>
                        </div>

                        {/* Search Input (shown when search tab is active) */}
                        {activeTab === 'search' && (
                            <div className="p-4 border-b border-white/10">
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search conversations..."
                                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                                        autoFocus
                                    />
                                </div>
                            </div>
                        )}

                        {/* New Chat Button (only in history tab) */}
                        {activeTab === 'history' && (
                            <div className="p-4">
                                <button
                                    onClick={() => {
                                        onNewChat();
                                        if (window.innerWidth < 768) onClose();
                                    }}
                                    className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-medium transition-colors shadow-lg shadow-indigo-900/30"
                                >
                                    <Plus size={18} />
                                    New Chat
                                </button>
                            </div>
                        )}

                        {/* Session List */}
                        <div className="flex-1 overflow-y-auto px-2 space-y-1">
                            {isLoading ? (
                                <div className="text-center text-white/40 py-8 text-sm">
                                    Loading history...
                                </div>
                            ) : (activeTab === 'search' ? filteredSessions : sessions).length === 0 ? (
                                <div className="text-center text-white/70 py-16 text-sm flex flex-col items-center justify-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                                        {activeTab === 'search' ? <Search size={24} className="text-white/20" /> : <MessageSquare size={24} className="text-white/20" />}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-white/80">
                                            {activeTab === 'search' ? (searchQuery ? 'No results found' : 'Search conversations') : 'No chat history yet'}
                                        </p>
                                        <p className="text-xs text-white/40">
                                            {activeTab === 'search' ? (searchQuery ? 'Try a different search term' : 'Type to search your chat history') : 'Your conversations will appear here'}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                (activeTab === 'search' ? filteredSessions : sessions).map(session => (
                                    <button
                                        key={session.id}
                                        onClick={() => {
                                            if (session.source === 'slack') {
                                                // Handle Slack viewing
                                                onSelectSession(session.id, 'slack');
                                            } else {
                                                onSelectSession(session.id, 'web');
                                            }
                                            if (window.innerWidth < 768) onClose();
                                        }}
                                        className={`w-full group flex items-center gap-3 p-3 rounded-lg text-left transition-all ${currentSessionId === session.id
                                            ? 'bg-white/10 text-white'
                                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        {session.source === 'slack' ? (
                                            <Slack size={16} className="flex-shrink-0 text-amber-400" />
                                        ) : (
                                            <MessageSquare size={16} className="flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {session.title || 'New Conversation'}
                                            </p>
                                            <p className="text-[10px] opacity-60">
                                                {format(new Date(session.created_at), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                        {session.source === 'web' && (
                                            <div
                                                onClick={(e) => handleDeleteSession(e, session.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-all"
                                            >
                                                <Trash2 size={14} />
                                            </div>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
