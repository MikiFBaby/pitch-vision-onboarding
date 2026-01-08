"use client";

import * as React from 'react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { SignInPage } from '@/components/ui/sign-in';

function SetupForm() {
    const [invitation, setInvitation] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            setError('Invitation token is missing');
            setIsLoading(false);
            return;
        }

        const verifyToken = async () => {
            try {
                const response = await fetch('/api/auth/verify-invitation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const data = await response.json();

                if (data.valid) {
                    setInvitation(data.invitation);
                } else {
                    setError(data.error || 'Invalid or expired invitation');
                }
            } catch (err) {
                setError('Failed to verify invitation');
            } finally {
                setIsLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const handleSetupAccount = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsFinishing(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const password = formData.get("password") as string;
        // email is taken from invitation

        try {
            // 1. Create Firebase account
            const userCredential = await createUserWithEmailAndPassword(auth, invitation.email, password);

            // 2. Set display name
            await updateProfile(userCredential.user, {
                displayName: `${invitation.firstName} ${invitation.lastName}`
            });

            // 3. Complete registration in backend
            const response = await fetch('/api/auth/complete-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    firebaseUid: userCredential.user.uid
                })
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to complete registration');
            }

            // 4. Redirect to dashboard
            router.push(`/login?role=${data.user.role}`);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Registration failed');
            setIsFinishing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
                <div className="animate-pulse">Verifying invitation...</div>
            </div>
        );
    }

    // Reuse SignInPage with customized props for Setup
    return (
        <SignInPage
            title={<span className="font-light text-white tracking-tighter">Setup Account</span>}
            description={
                error ? (
                    <span className="text-red-400 font-medium">{error}</span>
                ) : (
                    <>
                        Hi <span className="text-white font-semibold">{invitation?.firstName}</span>,
                        complete your registration for the <span className="text-violet-400 font-semibold">{invitation?.role?.toUpperCase()}</span> portal.
                    </>
                )
            }
            heroImageSrc="/images/login-hero-ai.png"
            onSignIn={handleSetupAccount}
            isLoading={isFinishing}
            buttonText="Complete Setup"
            showSocial={false}
            showRememberMe={false}
            showCreateAccount={false}
            emailReadOnly={true}
            defaultEmailValue={invitation?.email || ""}
        />
    );
}

export default function SetupPage() {
    return (
        <div className="min-h-screen w-screen bg-black">
            <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}>
                <SetupForm />
            </Suspense>
        </div>
    );
}
