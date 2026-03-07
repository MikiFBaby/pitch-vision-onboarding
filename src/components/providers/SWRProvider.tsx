"use client";

import { SWRConfig } from "swr";

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) {
    let serverMessage = "";
    try {
      const body = await r.json();
      serverMessage = body?.error || body?.message || "";
    } catch {
      // Response body was not JSON
    }
    throw new Error(
      serverMessage
        ? `${url}: ${r.status} - ${serverMessage}`
        : `${url}: ${r.status} ${r.statusText}`
    );
  }
  return r.json();
};

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 5000,
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
