"use client";
import React, { useState, useCallback } from "react";
import {
    CheckCircle,
    XCircle,
    ChevronRight,
    RotateCcw,
    Trophy,
    AlertTriangle,
    FileQuestion,
} from "lucide-react";

interface QuizQuestion {
    id: number;
    type: "multiple_choice" | "true_false";
    question: string;
    options?: string[];
    correct_answer: number | boolean;
    explanation: string;
}

interface QuizData {
    quiz_id: string;
    chapter: number;
    title: string;
    description: string;
    passing_score: number;
    questions: QuizQuestion[];
}

interface QuizRendererProps {
    quizData: QuizData;
    passingScore: number;
    onComplete?: (score: number, passed: boolean) => void;
}

export default function QuizRenderer({ quizData, passingScore, onComplete }: QuizRendererProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [answered, setAnswered] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [quizComplete, setQuizComplete] = useState(false);

    const questions = quizData.questions;
    const currentQuestion = questions[currentIndex];
    const totalQuestions = questions.length;

    const isCorrect = useCallback(() => {
        if (!currentQuestion || selectedAnswer === null) return false;
        if (currentQuestion.type === "true_false") {
            return selectedAnswer === (currentQuestion.correct_answer === true ? 0 : 1);
        }
        return selectedAnswer === currentQuestion.correct_answer;
    }, [currentQuestion, selectedAnswer]);

    const handleAnswer = (answerIndex: number) => {
        if (answered) return;
        setSelectedAnswer(answerIndex);
        setAnswered(true);

        let correct = false;
        if (currentQuestion.type === "true_false") {
            correct = answerIndex === (currentQuestion.correct_answer === true ? 0 : 1);
        } else {
            correct = answerIndex === currentQuestion.correct_answer;
        }

        if (correct) {
            setCorrectCount((prev) => prev + 1);
        }
    };

    const handleNext = () => {
        if (currentIndex + 1 >= totalQuestions) {
            setQuizComplete(true);
            const finalCorrect = correctCount;
            const scorePercent = Math.round((finalCorrect / totalQuestions) * 100);
            onComplete?.(scorePercent, scorePercent >= passingScore);
        } else {
            setCurrentIndex((prev) => prev + 1);
            setSelectedAnswer(null);
            setAnswered(false);
        }
    };

    const handleRetry = () => {
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setAnswered(false);
        setCorrectCount(0);
        setQuizComplete(false);
    };

    const scorePercent = Math.round((correctCount / totalQuestions) * 100);
    const passed = scorePercent >= passingScore;

    // Summary screen
    if (quizComplete) {
        return (
            <div className="glass-card rounded-2xl border border-white/5 p-8 max-w-4xl">
                <div className="text-center space-y-6">
                    <div className={`inline-flex p-5 rounded-full ${passed ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
                        {passed ? (
                            <Trophy className="w-12 h-12 text-emerald-400" />
                        ) : (
                            <AlertTriangle className="w-12 h-12 text-rose-400" />
                        )}
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {passed ? "Quiz Passed!" : "Quiz Not Passed"}
                        </h2>
                        <p className="text-white/50 text-sm">
                            {passed
                                ? "Great job! You've demonstrated your knowledge."
                                : `You need ${passingScore}% to pass. Review the material and try again.`}
                        </p>
                    </div>

                    {/* Score display */}
                    <div className="flex items-center justify-center gap-8">
                        <div className="text-center">
                            <div className={`text-5xl font-bold ${passed ? "text-emerald-400" : "text-rose-400"}`}>
                                {scorePercent}%
                            </div>
                            <div className="text-xs text-white/40 mt-1 uppercase tracking-wider">Score</div>
                        </div>
                        <div className="w-px h-16 bg-white/10" />
                        <div className="text-center">
                            <div className="text-3xl font-bold text-white">
                                {correctCount}/{totalQuestions}
                            </div>
                            <div className="text-xs text-white/40 mt-1 uppercase tracking-wider">Correct</div>
                        </div>
                        <div className="w-px h-16 bg-white/10" />
                        <div className="text-center">
                            <div className="text-3xl font-bold text-white">{passingScore}%</div>
                            <div className="text-xs text-white/40 mt-1 uppercase tracking-wider">Required</div>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="max-w-sm mx-auto">
                        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${passed ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-rose-500 to-rose-400"}`}
                                style={{ width: `${scorePercent}%` }}
                            />
                        </div>
                    </div>

                    {!passed && (
                        <button
                            onClick={handleRetry}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm transition-colors"
                        >
                            <RotateCcw size={16} />
                            Retry Quiz
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Question options
    const options =
        currentQuestion.type === "true_false"
            ? ["True", "False"]
            : currentQuestion.options || [];

    const getCorrectIndex = () => {
        if (currentQuestion.type === "true_false") {
            return currentQuestion.correct_answer === true ? 0 : 1;
        }
        return currentQuestion.correct_answer as number;
    };

    return (
        <div className="max-w-4xl space-y-6">
            {/* Progress header */}
            <div className="glass-card rounded-2xl border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <FileQuestion size={16} className="text-indigo-400" />
                        <span className="text-sm font-bold text-white">{quizData.title}</span>
                    </div>
                    <span className="text-sm text-white/50">
                        Question {currentIndex + 1} of {totalQuestions}
                    </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
                    />
                </div>
            </div>

            {/* Question card */}
            <div className="glass-card rounded-2xl border border-white/5 p-6">
                <div className="flex items-start gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-indigo-400">{currentIndex + 1}</span>
                    </div>
                    <h3 className="text-lg font-medium text-white leading-relaxed">
                        {currentQuestion.question}
                    </h3>
                </div>

                {/* Answer options */}
                <div className="space-y-3">
                    {options.map((option, idx) => {
                        const isSelected = selectedAnswer === idx;
                        const isCorrectAnswer = idx === getCorrectIndex();
                        let optionStyle = "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 cursor-pointer";

                        if (answered) {
                            if (isCorrectAnswer) {
                                optionStyle = "bg-emerald-500/10 border-emerald-500/30";
                            } else if (isSelected && !isCorrectAnswer) {
                                optionStyle = "bg-rose-500/10 border-rose-500/30";
                            } else {
                                optionStyle = "bg-white/5 border-white/5 opacity-50";
                            }
                        }

                        const letter = currentQuestion.type === "true_false" ? "" : String.fromCharCode(65 + idx);

                        return (
                            <button
                                key={idx}
                                onClick={() => handleAnswer(idx)}
                                disabled={answered}
                                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${optionStyle}`}
                            >
                                {currentQuestion.type !== "true_false" && (
                                    <div
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                                            answered && isCorrectAnswer
                                                ? "bg-emerald-500/20 text-emerald-400"
                                                : answered && isSelected && !isCorrectAnswer
                                                  ? "bg-rose-500/20 text-rose-400"
                                                  : "bg-white/10 text-white/60"
                                        }`}
                                    >
                                        {letter}
                                    </div>
                                )}

                                <span className={`flex-1 text-sm ${answered && !isCorrectAnswer && !isSelected ? "text-white/40" : "text-white"}`}>
                                    {option}
                                </span>

                                {answered && isCorrectAnswer && (
                                    <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
                                )}
                                {answered && isSelected && !isCorrectAnswer && (
                                    <XCircle size={18} className="text-rose-400 flex-shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Explanation */}
                {answered && (
                    <div className={`mt-4 p-4 rounded-xl border ${isCorrect() ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
                        <div className="flex items-start gap-2">
                            {isCorrect() ? (
                                <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                            ) : (
                                <XCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
                            )}
                            <div>
                                <p className={`text-sm font-medium mb-1 ${isCorrect() ? "text-emerald-400" : "text-rose-400"}`}>
                                    {isCorrect() ? "Correct!" : "Incorrect"}
                                </p>
                                <p className="text-sm text-white/60">{currentQuestion.explanation}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Next button */}
            {answered && (
                <button
                    onClick={handleNext}
                    className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                    {currentIndex + 1 >= totalQuestions ? "See Results" : "Next Question"}
                    <ChevronRight size={16} />
                </button>
            )}
        </div>
    );
}
