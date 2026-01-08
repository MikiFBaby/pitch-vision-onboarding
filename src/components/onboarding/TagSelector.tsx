"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagSelectorProps {
    selectedTags: string[];
    onChange: (tags: string[]) => void;
    suggestions?: string[];
}

export function TagSelector({ selectedTags, onChange, suggestions = [] }: TagSelectorProps) {
    const [inputValue, setInputValue] = useState('');

    const handleAddTag = (tag: string) => {
        const cleanedTag = tag.trim().toLowerCase();
        if (cleanedTag && !selectedTags.includes(cleanedTag)) {
            onChange([...selectedTags, cleanedTag]);
        }
        setInputValue('');
    };

    const handleRemoveTag = (tagToRemove: string) => {
        onChange(selectedTags.filter(tag => tag !== tagToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddTag(inputValue);
        }
    };

    return (
        <div className="space-y-4">
            <div className="relative">
                <div className={cn(
                    "flex flex-wrap gap-2 p-3 rounded-xl bg-white/5 border border-white/10 min-h-[56px] transition-all focus-within:border-white/20 focus-within:bg-white/10",
                    "backdrop-blur-xl"
                )}>
                    <AnimatePresence>
                        {selectedTags.map((tag) => (
                            <motion.span
                                key={tag}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-1.5 px-3 py-1 bg-white/10 border border-white/10 rounded-full text-xs font-medium text-white/90 group"
                            >
                                <Hash className="w-3 h-3 text-white/40" />
                                {tag}
                                <button
                                    onClick={() => handleRemoveTag(tag)}
                                    className="hover:text-white transition-colors"
                                >
                                    <X className="w-3 h-3 text-white/40 group-hover:text-white" />
                                </button>
                            </motion.span>
                        ))}
                    </AnimatePresence>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={selectedTags.length === 0 ? "Add interests (e.g. AI, Strategy, Golf)..." : ""}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-white/20 min-w-[120px]"
                        onBlur={() => handleAddTag(inputValue)}
                    />
                </div>
            </div>

            {suggestions.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1">Suggestions</p>
                    <div className="flex flex-wrap gap-2">
                        {suggestions
                            .filter(s => !selectedTags.includes(s.toLowerCase()))
                            .map((suggestion) => (
                                <button
                                    key={suggestion}
                                    onClick={() => handleAddTag(suggestion)}
                                    className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[11px] text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all"
                                >
                                    + {suggestion}
                                </button>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}
