"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ManagerTeamRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace("/manager/coach"); }, [router]);
    return null;
}
