import React, { createContext, useContext, useState, ReactNode } from 'react';

interface QAContextType {
    reviewCount: number;
    setReviewCount: (count: number) => void;
    isAnalyzerOpen: boolean;
    setAnalyzerOpen: (open: boolean) => void;
}

const QAContext = createContext<QAContextType | undefined>(undefined);

export function QAProvider({ children }: { children: ReactNode }) {
    const [reviewCount, setReviewCount] = useState(0);
    const [isAnalyzerOpen, setAnalyzerOpen] = useState(false);

    return (
        <QAContext.Provider value={{ reviewCount, setReviewCount, isAnalyzerOpen, setAnalyzerOpen }}>
            {children}
        </QAContext.Provider>
    );
}

export function useQA() {
    const context = useContext(QAContext);
    if (context === undefined) {
        throw new Error('useQA must be used within a QAProvider');
    }
    return context;
}
