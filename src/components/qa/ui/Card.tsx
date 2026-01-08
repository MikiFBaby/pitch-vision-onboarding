"use client";

import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', noPadding = false }) => {
    return (
        <div className={`bg-white/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-xl ${noPadding ? '' : 'p-6'} ${className}`}>
            {children}
        </div>
    );
};

export default Card;
