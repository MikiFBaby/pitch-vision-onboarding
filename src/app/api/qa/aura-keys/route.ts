import { NextResponse } from "next/server";

export async function GET() {
    // SECURITY WARNING: In a production app, this key should be restricted by domain or used via a proxy.
    // However, Gemini Live (WebSockets) requires a direct client connection or a sophisticated UDP/WS relay.
    // For this prototype/dev environment, exposing the key to the client (localhost) is acceptable.

    return NextResponse.json({
        apiKey: process.env.GEMINI_API_KEY
    });
}
