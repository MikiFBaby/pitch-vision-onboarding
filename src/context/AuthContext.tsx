"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextType {
    user: User | null;
    profile: any | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    loginWithEmail: (email: string, password: string) => Promise<void>;
    signupWithEmail: (email: string, password: string, name: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshProfile = async () => {
        if (!auth.currentUser) {
            setProfile(null);
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firebaseUid: auth.currentUser.uid,
                    email: auth.currentUser.email,
                    photoUrl: auth.currentUser.photoURL
                })
            });

            const data = await response.json();
            if (data.success) {
                console.log("Profile refresh success:", data.user);
                setProfile(data.user);
            }
        } catch (error) {
            console.error("Error refreshing profile:", error);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user);
            if (user) {
                await refreshProfile();
            } else {
                setProfile(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error signing in with Google", error);
            throw error;
        }
    };

    const loginWithEmail = async (email: string, password: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Error signing in with Email", error);
            throw error;
        }
    }

    const signupWithEmail = async (email: string, password: string, name: string) => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            if (name) {
                await updateProfile(userCredential.user, {
                    displayName: name
                });
            }
        } catch (error) {
            console.error("Error signing up with Email", error);
            throw error;
        }
    }

    const logout = async () => {
        try {
            await signOut(auth);
            setProfile(null);
            // Redirect to login page
            window.location.href = '/login';
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, loginWithEmail, signupWithEmail, logout, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
