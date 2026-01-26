"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase-client";
import {
    Send, Paperclip, Hash, Plus, Search, Smile, Edit2, Trash2,
    File as FileIcon, MessageCircle, AlertTriangle, CheckCircle,
    Users, Megaphone, ChevronDown, ChevronUp, Pin, X, AtSign,
    UserPlus, MessageSquare, Clock, Phone, Moon, Circle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---
interface Message {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    attachment_url?: string;
    attachment_type?: 'text' | 'image' | 'file' | 'audio';
    attachment_name?: string;
    reactions: Record<string, string[]>;
    is_edited: boolean;
    is_pinned?: boolean;
    updated_at: string | null;
    user?: {
        first_name: string;
        last_name: string;
        user_image: string | null;
    };
}

interface Conversation {
    id: string;
    name: string;
    type: 'channel' | 'dm' | 'group';
    participants?: string[];
    created_at: string;
    created_by?: string;
}

interface DirectoryUser {
    id: string;
    first_name: string;
    last_name: string;
    user_image: string | null;
    role: string;
    email: string;
}

// Status options
const STATUS_OPTIONS = [
    { key: 'online', label: 'Online', icon: Circle, color: 'text-green-400', bg: 'bg-green-500' },
    { key: 'away', label: 'Away', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500' },
    { key: 'oncall', label: 'On Call', icon: Phone, color: 'text-red-400', bg: 'bg-red-500' },
    { key: 'dnd', label: 'Do Not Disturb', icon: Moon, color: 'text-purple-400', bg: 'bg-purple-500' },
];

// Quick action prompts
const QUICK_ACTIONS = [
    { icon: AlertTriangle, label: "Escalate", message: "🚨 Escalating: ", color: "text-white", bg: "bg-amber-500", border: "border-amber-400" },
    { icon: CheckCircle, label: "Approve", message: "✅ Requesting approval: ", color: "text-white", bg: "bg-emerald-500", border: "border-emerald-400" },
    { icon: Megaphone, label: "Announce", message: "📢 Announcement: ", color: "text-white", bg: "bg-sky-500", border: "border-sky-400" },
    { icon: Users, label: "Training", message: "📝 Training flag: ", color: "text-white", bg: "bg-violet-500", border: "border-violet-400" },
];

// --- Component ---
export function MessagesView() {
    const { user, profile } = useAuth();

    // Conversations (channels, DMs, groups)
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [messageSearch, setMessageSearch] = useState("");

    // New conversation modal
    const [showNewConvoModal, setShowNewConvoModal] = useState(false);
    const [newConvoType, setNewConvoType] = useState<'channel' | 'dm' | 'group'>('channel');
    const [selectedPeople, setSelectedPeople] = useState<DirectoryUser[]>([]);
    const [newConvoName, setNewConvoName] = useState("");

    // @Mentions
    const [showMentions, setShowMentions] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [cursorPosition, setCursorPosition] = useState(0);

    // Team Directory
    const [directory, setDirectory] = useState<DirectoryUser[]>([]);
    const [showTeam, setShowTeam] = useState(true);
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [userStatuses, setUserStatuses] = useState<Record<string, string>>({});

    // Realtime
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const channelSubscriptionRef = useRef<any>(null);

    const reactionEmojis = ["👍", "❤️", "😂", "🔥", "👀"];

    // --- Init ---
    useEffect(() => {
        fetchConversations();
        fetchDirectory();

        // Presence tracking
        const presenceChannel = supabase.channel('global_presence');
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const newState = presenceChannel.presenceState();
                const userIds = new Set<string>();
                const statuses: Record<string, string> = {};
                for (const key in newState) {
                    // @ts-ignore
                    newState[key].forEach((presence: any) => {
                        if (presence.user_id) {
                            userIds.add(presence.user_id);
                            statuses[presence.user_id] = presence.status || 'online';
                        }
                    });
                }
                setOnlineUsers(userIds);
                setUserStatuses(statuses);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        user_id: profile?.id || user?.uid,
                        online_at: new Date().toISOString(),
                        status: 'online'
                    });
                }
            });

        return () => { presenceChannel.unsubscribe(); };
    }, [profile?.id, user?.uid]);

    useEffect(() => {
        if (activeConversation) {
            setUnreadCounts(prev => ({ ...prev, [activeConversation.id]: 0 }));
            fetchMessages(activeConversation.id);
            const subscription = subscribeToMessages(activeConversation.id);

            channelSubscriptionRef.current = supabase.channel(`room:${activeConversation.id}`);
            channelSubscriptionRef.current
                .on('broadcast', { event: 'typing' }, (payload: any) => {
                    if (payload.payload.user_id !== (profile?.id || user?.uid)) {
                        setTypingUsers(prev => new Set(prev).add(payload.payload.user_id));
                        setTimeout(() => {
                            setTypingUsers(prev => {
                                const next = new Set(prev);
                                next.delete(payload.payload.user_id);
                                return next;
                            });
                        }, 3000);
                    }
                })
                .subscribe();

            return () => {
                subscription.unsubscribe();
                channelSubscriptionRef.current?.unsubscribe();
            };
        }
    }, [activeConversation]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, typingUsers]);

    // --- Data Fetching ---
    const fetchConversations = async () => {
        // For now, fetch from chat_channels and treat all as channels
        // In future, filter by type and participants
        const { data } = await supabase.from("chat_channels").select("*").order("name");
        if (data) {
            setConversations(data.map(c => ({ ...c, type: c.type || 'channel' })));
        }
    };

    const fetchDirectory = async () => {
        const { data } = await supabase
            .from("employee_directory")
            .select("id, first_name, last_name, user_image, role, email")
            .order("first_name");
        if (data) setDirectory(data as any);
    };

    const createConversation = async () => {
        if (newConvoType === 'channel' && !newConvoName.trim()) return;
        if ((newConvoType === 'dm' || newConvoType === 'group') && selectedPeople.length === 0) return;

        let name = newConvoName.trim();
        if (newConvoType === 'dm') {
            name = `DM: ${selectedPeople[0]?.first_name} ${selectedPeople[0]?.last_name}`;
        } else if (newConvoType === 'group' && !name) {
            name = `Group: ${selectedPeople.map(p => p.first_name).join(', ')}`;
        }

        const { data } = await supabase.from("chat_channels").insert({
            name,
            type: newConvoType,
            participants: [profile?.id, ...selectedPeople.map(p => p.id)],
            created_by: profile?.id
        }).select().single();

        if (data) {
            setConversations(prev => [...prev, { ...data, type: data.type || newConvoType }]);
            setActiveConversation({ ...data, type: data.type || newConvoType });
            closeNewConvoModal();
        }
    };

    const closeNewConvoModal = () => {
        setShowNewConvoModal(false);
        setNewConvoType('channel');
        setSelectedPeople([]);
        setNewConvoName("");
    };

    const startDMWith = (person: DirectoryUser) => {
        // Check if DM already exists
        const existing = conversations.find(c =>
            c.type === 'dm' && c.participants?.includes(person.id)
        );
        if (existing) {
            setActiveConversation(existing);
            return;
        }
        // Open modal pre-filled
        setNewConvoType('dm');
        setSelectedPeople([person]);
        setShowNewConvoModal(true);
    };

    const fetchMessages = async (conversationId: string) => {
        setIsLoading(true);
        const { data } = await supabase
            .from("chat_messages")
            .select(`*, user:employee_directory(first_name, last_name, user_image)`)
            .eq("channel_id", conversationId)
            .order("created_at", { ascending: true });
        if (data) setMessages(data as any);
        setIsLoading(false);
    };

    const subscribeToMessages = (conversationId: string) => {
        return supabase
            .channel(`chat_sub:${conversationId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${conversationId}` }, async (payload) => {
                if (payload.eventType === 'INSERT') {
                    const { data } = await supabase
                        .from("chat_messages")
                        .select(`*, user:employee_directory(first_name, last_name, user_image)`)
                        .eq("id", payload.new.id)
                        .single();
                    if (data) {
                        setMessages(prev => [...prev, data as any]);
                        scrollToBottom();
                    }
                } else if (payload.eventType === 'UPDATE') {
                    setMessages(prev => prev.map(msg => msg.id === payload.new.id ? { ...msg, ...payload.new } : msg));
                } else if (payload.eventType === 'DELETE') {
                    setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
                }
            })
            .subscribe();
    };

    // --- Actions ---
    const scrollToBottom = () => {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    };

    const broadcastTyping = () => {
        if (channelSubscriptionRef.current) {
            channelSubscriptionRef.current.send({
                type: 'broadcast',
                event: 'typing',
                payload: { user_id: profile?.id || user?.uid }
            });
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const pos = e.target.selectionStart || 0;
        setNewMessage(value);
        setCursorPosition(pos);

        // Check for @mention trigger
        const textBeforeCursor = value.slice(0, pos);
        const atMatch = textBeforeCursor.match(/@(\w*)$/);
        if (atMatch) {
            setMentionQuery(atMatch[1]);
            setShowMentions(true);
        } else {
            setShowMentions(false);
        }

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(broadcastTyping, 500);
    };

    const insertMention = (person: DirectoryUser) => {
        const textBeforeCursor = newMessage.slice(0, cursorPosition);
        const textAfterCursor = newMessage.slice(cursorPosition);
        const beforeAt = textBeforeCursor.replace(/@\w*$/, '');
        const mention = `@${person.first_name} `;
        setNewMessage(beforeAt + mention + textAfterCursor);
        setShowMentions(false);
        inputRef.current?.focus();
    };

    const sendMessage = async (content: string, type: 'text' | 'image' | 'file' | 'audio' = 'text', url?: string, name?: string) => {
        if (!user || !activeConversation || !profile?.id) return;

        const { error } = await supabase.from("chat_messages").insert({
            channel_id: activeConversation.id,
            user_id: profile.id,
            content: content,
            attachment_type: type,
            attachment_url: url,
            attachment_name: name,
            reactions: {},
            is_pinned: false
        });

        if (!error) setNewMessage("");
    };

    const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
        setNewMessage(action.message);
        inputRef.current?.focus();
    };

    const togglePinMessage = async (msg: Message) => {
        await supabase.from("chat_messages").update({
            is_pinned: !msg.is_pinned
        }).eq("id", msg.id);
    };

    const handleEditMessage = async () => {
        if (!editingMessageId || !editContent.trim()) return;
        await supabase.from("chat_messages").update({
            content: editContent,
            is_edited: true,
            updated_at: new Date().toISOString()
        }).eq("id", editingMessageId);
        setEditingMessageId(null);
        setEditContent("");
    };

    const handleDeleteMessage = async (id: string) => {
        if (confirm("Delete this message?")) {
            await supabase.from("chat_messages").delete().eq("id", id);
        }
    };

    const handleReaction = async (msg: Message, emoji: string) => {
        const userId = profile?.id;
        if (!userId) return;

        const currentReactions = msg.reactions || {};
        const userList = currentReactions[emoji] || [];

        let newReactions;
        if (userList.includes(userId)) {
            const newList = userList.filter(id => id !== userId);
            if (newList.length === 0) {
                const { [emoji]: _, ...rest } = currentReactions;
                newReactions = rest;
            } else {
                newReactions = { ...currentReactions, [emoji]: newList };
            }
        } else {
            newReactions = { ...currentReactions, [emoji]: [...userList, userId] };
        }

        await supabase.from("chat_messages").update({ reactions: newReactions }).eq("id", msg.id);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('chat-attachments').upload(fileName, file);
        if (error) return;

        const { data: publicUrl } = supabase.storage.from('chat-attachments').getPublicUrl(fileName);
        const type = file.type.startsWith('image/') ? 'image' : 'file';
        await sendMessage(type === 'image' ? 'Image shared' : 'File shared', type, publicUrl.publicUrl, file.name);
    };

    // --- Helpers ---
    const formatTime = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const formatDate = (date: Date) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === today.toDateString()) return "Today";
        if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
        return date.toLocaleDateString();
    };

    const shouldShowDateSeparator = (curr: Message, prev?: Message) => {
        if (!prev) return true;
        return new Date(curr.created_at).toDateString() !== new Date(prev.created_at).toDateString();
    };

    const getStatusBadge = (userId: string) => {
        const status = userStatuses[userId] || (onlineUsers.has(userId) ? 'online' : null);
        if (!status) return null;
        const opt = STATUS_OPTIONS.find(s => s.key === status);
        return opt ? opt.bg : 'bg-green-500';
    };

    // Filtered data
    const filteredConversations = conversations.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const channels = filteredConversations.filter(c => c.type === 'channel');
    const dms = filteredConversations.filter(c => c.type === 'dm');
    const groups = filteredConversations.filter(c => c.type === 'group');

    const pinnedMessages = messages.filter(m => m.is_pinned);
    const regularMessages = messageSearch
        ? messages.filter(m => m.content.toLowerCase().includes(messageSearch.toLowerCase()))
        : messages;

    const mentionSuggestions = directory.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(mentionQuery.toLowerCase())
    ).slice(0, 5);

    const groupedDirectory = directory.reduce((acc, person) => {
        const role = person.role || 'Other';
        if (!acc[role]) acc[role] = [];
        acc[role].push(person);
        return acc;
    }, {} as Record<string, DirectoryUser[]>);

    // --- Render ---
    return (
        <div className="flex h-[calc(100vh-140px)] rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-2xl">
            {/* Left Panel */}
            <div className="w-80 bg-[#111] border-r border-white/10 flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-white/10 bg-[#0d0d0d]">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-indigo-400" />
                            <h2 className="font-bold text-white text-sm">Messages</h2>
                        </div>
                        <button
                            onClick={() => setShowNewConvoModal(true)}
                            className="p-1.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/20"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Direct Messages */}
                    {dms.length > 0 && (
                        <div className="p-3">
                            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 px-2 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> Direct Messages
                            </p>
                            <div className="space-y-0.5">
                                {dms.map(conv => (
                                    <ConversationItem
                                        key={conv.id}
                                        conv={conv}
                                        active={activeConversation?.id === conv.id}
                                        unread={unreadCounts[conv.id] || 0}
                                        onClick={() => setActiveConversation(conv)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Groups */}
                    {groups.length > 0 && (
                        <div className="p-3 border-t border-white/5">
                            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 px-2 flex items-center gap-1">
                                <Users className="w-3 h-3" /> Groups
                            </p>
                            <div className="space-y-0.5">
                                {groups.map(conv => (
                                    <ConversationItem
                                        key={conv.id}
                                        conv={conv}
                                        active={activeConversation?.id === conv.id}
                                        unread={unreadCounts[conv.id] || 0}
                                        onClick={() => setActiveConversation(conv)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Channels */}
                    <div className="p-3 border-t border-white/5">
                        <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 px-2 flex items-center gap-1">
                            <Hash className="w-3 h-3" /> Channels
                        </p>
                        <div className="space-y-0.5">
                            {channels.map(conv => (
                                <ConversationItem
                                    key={conv.id}
                                    conv={conv}
                                    active={activeConversation?.id === conv.id}
                                    unread={unreadCounts[conv.id] || 0}
                                    onClick={() => setActiveConversation(conv)}
                                />
                            ))}
                            {channels.length === 0 && (
                                <p className="text-xs text-white/40 text-center py-4">No channels yet</p>
                            )}
                        </div>
                    </div>

                    {/* Team Directory */}
                    <div className="p-3 border-t border-white/10">
                        <button onClick={() => setShowTeam(!showTeam)} className="w-full flex items-center justify-between px-2 mb-2">
                            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Team Directory</p>
                            {showTeam ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                        </button>

                        <AnimatePresence>
                            {showTeam && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="space-y-3 overflow-hidden"
                                >
                                    {Object.entries(groupedDirectory).map(([role, people]) => (
                                        <div key={role}>
                                            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider px-2 mb-1">{role}</p>
                                            <div className="space-y-0.5">
                                                {people.slice(0, 5).map(person => (
                                                    <button
                                                        key={person.id}
                                                        onClick={() => startDMWith(person)}
                                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-left group"
                                                    >
                                                        <div className="relative">
                                                            {person.user_image ? (
                                                                <img src={person.user_image} className="w-6 h-6 rounded-full object-cover" alt="" />
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-[10px]">
                                                                    {person.first_name[0]}
                                                                </div>
                                                            )}
                                                            {getStatusBadge(person.id) && (
                                                                <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 ${getStatusBadge(person.id)} border border-[#111] rounded-full`} />
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-white/80 truncate flex-1">{person.first_name} {person.last_name}</span>
                                                        <MessageSquare className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="p-3 border-t border-white/10 bg-[#0d0d0d]">
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-2 px-1">Quick Actions</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {QUICK_ACTIONS.map((action, i) => (
                            <button
                                key={i}
                                onClick={() => handleQuickAction(action)}
                                disabled={!activeConversation}
                                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-bold transition-all border ${action.bg} ${action.color} ${action.border} hover:brightness-125 disabled:cursor-not-allowed`}
                            >
                                <action.icon className="w-3.5 h-3.5" />
                                <span>{action.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-[#080808]">
                {activeConversation ? (
                    <>
                        {/* Header */}
                        <div className="h-14 px-5 flex items-center justify-between border-b border-white/10 bg-[#0d0d0d]">
                            <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg ${activeConversation.type === 'dm' ? 'bg-gradient-to-tr from-pink-500 to-rose-600' :
                                    activeConversation.type === 'group' ? 'bg-gradient-to-tr from-emerald-500 to-teal-600' :
                                        'bg-gradient-to-tr from-indigo-500 to-purple-600'
                                    }`}>
                                    {activeConversation.type === 'dm' ? <MessageSquare className="w-4 h-4" /> :
                                        activeConversation.type === 'group' ? <Users className="w-4 h-4" /> :
                                            <Hash className="w-4 h-4" />}
                                </div>
                                <div>
                                    <h2 className="font-bold text-white text-sm">{activeConversation.name}</h2>
                                    <p className="text-[10px] text-green-400 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        Active
                                    </p>
                                </div>
                            </div>

                            {/* Message Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <input
                                    type="text"
                                    placeholder="Search messages..."
                                    value={messageSearch}
                                    onChange={(e) => setMessageSearch(e.target.value)}
                                    className="pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-white/30 focus:ring-1 focus:ring-indigo-500 w-48"
                                />
                            </div>
                        </div>

                        {/* Pinned Messages */}
                        {pinnedMessages.length > 0 && (
                            <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/20">
                                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                                    <Pin className="w-3 h-3" /> Pinned Messages
                                </p>
                                <div className="space-y-1 max-h-24 overflow-y-auto">
                                    {pinnedMessages.map(msg => (
                                        <div key={msg.id} className="text-xs text-amber-200/80 truncate">
                                            <span className="text-amber-400 font-semibold">{msg.user?.first_name}:</span> {msg.content}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent"></div>
                                </div>
                            ) : regularMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-white/40">
                                    {messageSearch ? (
                                        <>
                                            <Search className="w-10 h-10 mb-3 opacity-50" />
                                            <p className="text-sm font-medium">No messages match "{messageSearch}"</p>
                                        </>
                                    ) : (
                                        <>
                                            <Hash className="w-10 h-10 mb-3 opacity-50" />
                                            <p className="text-sm font-medium">No messages yet</p>
                                            <p className="text-xs">Start the conversation!</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                regularMessages.map((msg, i) => {
                                    const isMe = msg.user_id === (profile?.id || user?.uid);
                                    const showDate = shouldShowDateSeparator(msg, regularMessages[i - 1]);
                                    const reactionCounts = msg.reactions ? Object.entries(msg.reactions).map(([emoji, users]) => ({
                                        emoji, count: users.length, hasReacted: users.includes(profile?.id || user?.uid || "")
                                    })).filter(r => r.count > 0) : [];

                                    // Highlight @mentions
                                    const highlightMentions = (text: string) => {
                                        const parts = text.split(/(@\w+)/g);
                                        return parts.map((part, idx) =>
                                            part.startsWith('@') ? <span key={idx} className="text-indigo-400 font-semibold">{part}</span> : part
                                        );
                                    };

                                    return (
                                        <div key={msg.id}>
                                            {showDate && (
                                                <div className="flex justify-center my-4">
                                                    <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-medium text-white/60 border border-white/10">
                                                        {formatDate(new Date(msg.created_at))}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`flex gap-2.5 group/msg ${isMe ? "flex-row-reverse" : ""}`}>
                                                {msg.user?.user_image ? (
                                                    <img src={msg.user.user_image} className="w-7 h-7 rounded-lg object-cover mt-auto ring-1 ring-white/20" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-[10px] mt-auto ring-1 ring-white/20">
                                                        {msg.user?.first_name?.[0] || '?'}
                                                    </div>
                                                )}
                                                <div className={`flex flex-col gap-0.5 max-w-[65%] ${isMe ? "items-end" : "items-start"}`}>
                                                    {!isMe && (
                                                        <span className="text-[10px] text-white/60 ml-1">{msg.user?.first_name}</span>
                                                    )}
                                                    <div className={`relative px-3 py-2 rounded-2xl text-sm ${msg.is_pinned ? 'ring-2 ring-amber-500/50' : ''
                                                        } ${isMe
                                                            ? "bg-indigo-600 text-white rounded-br-md shadow-lg shadow-indigo-500/20"
                                                            : "bg-white/10 text-white rounded-bl-md border border-white/10"
                                                        }`}>
                                                        {editingMessageId === msg.id ? (
                                                            <div className="min-w-[180px]">
                                                                <input
                                                                    type="text"
                                                                    value={editContent}
                                                                    onChange={(e) => setEditContent(e.target.value)}
                                                                    className="w-full bg-black/30 text-inherit text-sm rounded px-2 py-1 mb-2 border border-white/30"
                                                                    autoFocus
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={() => setEditingMessageId(null)} className="text-[10px] opacity-70">Cancel</button>
                                                                    <button onClick={handleEditMessage} className="text-[10px] bg-white/20 px-2 py-0.5 rounded">Save</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {highlightMentions(msg.content)}
                                                                {msg.attachment_type === 'image' && msg.attachment_url && (
                                                                    <img src={msg.attachment_url} className="rounded-lg max-w-full mt-2" />
                                                                )}
                                                                {msg.attachment_type === 'file' && msg.attachment_url && (
                                                                    <a href={msg.attachment_url} target="_blank" className="flex items-center gap-2 mt-2 p-2 bg-black/20 rounded-lg border border-white/10">
                                                                        <FileIcon className="w-4 h-4" />
                                                                        <span className="underline truncate text-xs">{msg.attachment_name}</span>
                                                                    </a>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 px-1">
                                                        <span className="text-[9px] text-white/40">
                                                            {formatTime(msg.created_at)}
                                                            {msg.is_edited && <span className="ml-1">(edited)</span>}
                                                        </span>
                                                        {reactionCounts.length > 0 && (
                                                            <div className="flex gap-0.5">
                                                                {reactionCounts.map(r => (
                                                                    <button
                                                                        key={r.emoji}
                                                                        onClick={() => handleReaction(msg, r.emoji)}
                                                                        className={`text-[9px] px-1 py-0.5 rounded-full flex items-center gap-0.5 border ${r.hasReacted ? "bg-indigo-500/30 border-indigo-500/50 text-white" : "bg-white/5 border-white/10 text-white/60"}`}
                                                                    >
                                                                        {r.emoji}{r.count}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {/* Actions */}
                                                        <div className="opacity-0 group-hover/msg:opacity-100 flex items-center gap-0.5 transition-opacity">
                                                            <button onClick={() => togglePinMessage(msg)} className={`p-0.5 hover:bg-white/10 rounded ${msg.is_pinned ? 'text-amber-400' : 'text-white/40 hover:text-amber-400'}`}>
                                                                <Pin className="w-3 h-3" />
                                                            </button>
                                                            <div className="relative group/emojis">
                                                                <button className="p-0.5 hover:bg-white/10 rounded text-white/40 hover:text-white">
                                                                    <Smile className="w-3 h-3" />
                                                                </button>
                                                                <div className="absolute bottom-5 left-0 flex gap-0.5 bg-[#1a1a1a] border border-white/20 p-1 rounded-lg shadow-xl opacity-0 group-hover/emojis:opacity-100 transition-opacity pointer-events-none group-hover/emojis:pointer-events-auto z-10">
                                                                    {reactionEmojis.map(emoji => (
                                                                        <button key={emoji} onClick={() => handleReaction(msg, emoji)} className="hover:scale-110 transition-transform text-xs p-0.5">{emoji}</button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            {isMe && (
                                                                <>
                                                                    <button onClick={() => { setEditingMessageId(msg.id); setEditContent(msg.content); }} className="p-0.5 hover:bg-white/10 rounded text-white/40 hover:text-white">
                                                                        <Edit2 className="w-3 h-3" />
                                                                    </button>
                                                                    <button onClick={() => handleDeleteMessage(msg.id)} className="p-0.5 hover:bg-white/10 rounded text-white/40 hover:text-rose-400">
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-4">
                        <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
                            <MessageCircle className="w-8 h-8" />
                        </div>
                        <p className="text-sm">Select a conversation to start messaging</p>
                    </div>
                )}

                {/* Input Area */}
                {activeConversation && (
                    <div className="p-4 border-t border-white/10 bg-[#0d0d0d]">
                        <div className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={newMessage}
                                onChange={handleInputChange}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage(newMessage);
                                    }
                                }}
                                placeholder={`Message ${activeConversation.name}...`}
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                            >
                                <Paperclip className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => sendMessage(newMessage)}
                                disabled={!newMessage.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:bg-transparent disabled:text-white/20 transition-all"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />

                            {/* Mentions Dropdown */}
                            <AnimatePresence>
                                {showMentions && mentionSuggestions.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1a1a] border border-white/20 rounded-xl shadow-2xl overflow-hidden z-20"
                                    >
                                        <p className="px-3 py-2 text-[10px] font-bold text-white/40 uppercase tracking-widest border-b border-white/10">Suggested People</p>
                                        <div className="p-1">
                                            {mentionSuggestions.map(person => (
                                                <button
                                                    key={person.id}
                                                    onClick={() => insertMention(person)}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-500/20 hover:text-indigo-200 text-left transition-colors"
                                                >
                                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                                                        {person.first_name[0]}
                                                    </div>
                                                    <span className="text-xs text-white/80">{person.first_name} {person.last_name}</span>
                                                    <span className="ml-auto text-[9px] text-white/30 uppercase">{person.role}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>

            {/* New Conversation Modal */}
            <AnimatePresence>
                {showNewConvoModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                        >
                            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                                <h3 className="font-bold text-white">New Message</h3>
                                <button onClick={closeNewConvoModal} className="text-white/40 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 space-y-4">
                                {/* Type Selector */}
                                <div className="flex bg-white/5 rounded-lg p-1">
                                    {(['channel', 'dm', 'group'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setNewConvoType(t)}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md capitalize transition-all ${newConvoType === t ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                                        >
                                            {t === 'dm' ? 'Direct Message' : t}
                                        </button>
                                    ))}
                                </div>

                                {/* Inputs */}
                                {newConvoType === 'channel' && (
                                    <div>
                                        <label className="text-xs font-bold text-white/60 mb-1.5 block">Channel Name</label>
                                        <div className="relative">
                                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                            <input
                                                type="text"
                                                value={newConvoName}
                                                onChange={e => setNewConvoName(e.target.value)}
                                                className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:border-indigo-500"
                                                placeholder="e.g. announcements"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-white/60 mb-1.5 block">Add People</label>
                                    <div className="min-h-[100px] max-h-[200px] overflow-y-auto bg-black/30 border border-white/10 rounded-xl p-2 space-y-1">
                                        {directory.map(person => {
                                            const isSelected = selectedPeople.some(p => p.id === person.id);
                                            return (
                                                <button
                                                    key={person.id}
                                                    onClick={() => {
                                                        if (newConvoType === 'dm') {
                                                            setSelectedPeople([person]);
                                                        } else {
                                                            setSelectedPeople(prev => isSelected ? prev.filter(p => p.id !== person.id) : [...prev, person]);
                                                        }
                                                    }}
                                                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg border transition-all ${isSelected ? 'bg-indigo-500/20 border-indigo-500 text-white' : 'bg-transparent border-transparent hover:bg-white/5 text-white/60'}`}
                                                >
                                                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                                        {person.first_name[0]}
                                                    </div>
                                                    <span className="text-sm">{person.first_name} {person.last_name}</span>
                                                    {isSelected && <CheckCircle className="w-4 h-4 text-indigo-400 ml-auto" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button
                                    onClick={createConversation}
                                    className="w-full py-2.5 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Create {newConvoType === 'dm' ? 'Chat' : newConvoType}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ConversationItem({ conv, active, unread, onClick }: { conv: Conversation, active: boolean, unread: number, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all group ${active ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
            <div className={`w-4 h-4 flex items-center justify-center opacity-70 ${active ? 'text-white' : 'group-hover:text-indigo-400'}`}>
                {conv.type === 'channel' ? <Hash className="w-3.5 h-3.5" /> : conv.type === 'group' ? <Users className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
            </div>
            <span className="text-sm truncate flex-1 text-left">{conv.name}</span>
            {unread > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full">{unread}</span>
            )}
        </button>
    );
}
