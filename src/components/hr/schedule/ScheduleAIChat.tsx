"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, X, Bot, User, Stars } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PitchVisionLogo } from "@/components/ui/pitch-vision-logo";

interface ScheduleAIChatProps {
    scheduleData: any[];
}

interface Message {
    id: string;
    role: "user" | "ai";
    content: string;
}

const HIGH_VALUE_PROMPTS = [
    { label: "Analyze Coverage", prompt: "Analyze the current weekly coverage. Are there any days with low staffing?" },
    { label: "Predict Overtime", prompt: "Based on the schedule, which agents are likely to hit overtime this week?" },
    { label: "Identify Gaps", prompt: "Identify any major gaps in the schedule where we might be understaffed." },
    { label: "Staffing Summary", prompt: "Give me a quick summary of the staffing levels for this week." },
];

export default function ScheduleAIChat({ scheduleData }: ScheduleAIChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "ai",
            content: "Hello, I am Aura. How can I assist with your workforce planning today?"
        }
    ]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    const handleSend = async (text: string) => {
        if (!text.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsTyping(true);

        // Simulate AI processing delay
        setTimeout(() => {
            const response = generateMockResponse(text, scheduleData);
            const aiMsg: Message = { id: (Date.now() + 1).toString(), role: "ai", content: response };
            setMessages(prev => [...prev, aiMsg]);
            setIsTyping(false);
        }, 1500);
    };

    const generateMockResponse = (query: string, data: any[]) => {
        const lowerQ = query.toLowerCase();

        if (lowerQ.includes("coverage") || lowerQ.includes("staffing")) {
            return `Looking at the current schedule, coverage is optimal on Tuesday and Wednesday (90%+). However, Monday morning shows a slight dip to 85% availability. I recommend monitoring queue times then.`;
        }
        if (lowerQ.includes("overtime")) {
            return `I've detected 3 agents projected to exceed 45 hours this week. 'Aaliah Rhau' is at highest risk. Adjusting her Friday shift could prevent overtime costs.`;
        }
        if (lowerQ.includes("gaps") || lowerQ.includes("open")) {
            return `Attention needed: There is a notable coverage gap on Friday between 14:00 and 16:00. Active workforce drops to 60%. I suggest soliciting volunteers for coverage.`;
        }

        return "I am Aura, calibrated for workforce intelligence. I can analyze coverage, predict overtime, or identify schedule gaps. Please ask about one of these topics.";
    };

    return (
        <>
            {/* Floating Trigger Button */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsOpen(true)}
                        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-rose-500 to-indigo-600 text-white rounded-full shadow-[0_0_20px_rgba(244,63,94,0.5)] hover:shadow-[0_0_30px_rgba(244,63,94,0.7)] transition-all border border-white/20"
                    >
                        <Stars className="w-5 h-5 fill-white animate-pulse" />
                        <span className="font-bold text-base tracking-wide">Ask Aura</span>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Modal Overlay directly */}
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">

                        {/* Modal Content */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-2xl h-[700px] flex flex-col bg-[#0f1014] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                        >
                            {/* Abstract Background Elements */}
                            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-rose-500/10 rounded-full blur-[100px] -z-10" />
                            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] -z-10" />

                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5 backdrop-blur-md">
                                <div className="flex items-center gap-4">
                                    <PitchVisionLogo className="scale-75 origin-left" />
                                    <div>
                                        <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-indigo-400">
                                            Aura
                                        </h3>
                                        <p className="text-xs text-white/50 font-medium tracking-wider uppercase">
                                            Workforce Intelligence
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsOpen(false)}
                                    className="rounded-full w-10 h-10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
                                {messages.map((msg) => (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "flex gap-4 max-w-[85%]",
                                            msg.role === "user" ? "ml-auto flex-row-reverse" : ""
                                        )}
                                    >
                                        <div className={cn(
                                            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg",
                                            msg.role === "ai" ? "bg-gradient-to-br from-gray-800 to-black border border-white/10" : "bg-gradient-to-br from-rose-500 to-rose-600"
                                        )}>
                                            {msg.role === "ai" ? (
                                                <Stars className="w-5 h-5 text-rose-400" />
                                            ) : (
                                                <User className="w-5 h-5 text-white" />
                                            )}
                                        </div>
                                        <div className={cn(
                                            "p-5 rounded-3xl text-sm leading-relaxed shadow-sm",
                                            msg.role === "ai"
                                                ? "bg-white/5 text-gray-100 rounded-tl-sm border border-white/5"
                                                : "bg-rose-600 text-white rounded-tr-sm"
                                        )}>
                                            {msg.content}
                                        </div>
                                    </motion.div>
                                ))}
                                {isTyping && (
                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center">
                                            <Stars className="w-5 h-5 text-rose-400" />
                                        </div>
                                        <div className="bg-white/5 rounded-3xl p-5 rounded-tl-sm flex gap-1.5 items-center h-[52px]">
                                            <span className="w-2 h-2 bg-rose-400/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                            <span className="w-2 h-2 bg-rose-400/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                            <span className="w-2 h-2 bg-rose-400/60 rounded-full animate-bounce" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Interactions Area */}
                            <div className="p-6 bg-[#0f1014] border-t border-white/10">
                                {/* High Value Chips */}
                                <div className="mb-4">
                                    <ScrollArea className="w-full whitespace-nowrap">
                                        <div className="flex gap-3 pb-2">
                                            {HIGH_VALUE_PROMPTS.map((item, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleSend(item.prompt)}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-rose-500/30 text-white/70 hover:text-white text-xs font-semibold transition-all duration-200 whitespace-nowrap group"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>

                                {/* Input */}
                                <div className="relative flex items-center gap-3">
                                    <div className="relative flex-1">
                                        <Input
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                                            placeholder="Ask Aura about your schedule..."
                                            className="h-12 pl-5 pr-4 bg-black/40 border-white/10 rounded-2xl text-white placeholder:text-white/30 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all font-medium"
                                        />
                                    </div>
                                    <Button
                                        size="icon"
                                        onClick={() => handleSend(input)}
                                        className="h-12 w-12 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                                    >
                                        <Send className="w-5 h-5 text-white" />
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
