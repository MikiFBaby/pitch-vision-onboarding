import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Check if we are in "QA Only" mode via Environment Variable
    const isQaLocked = process.env.NEXT_PUBLIC_QA_ONLY === 'true';

    if (!isQaLocked) {
        return NextResponse.next();
    }

    const path = request.nextUrl.pathname;

    // Allow access to:
    // 1. The /qa route and sub-routes
    // 2. Static files (_next, images, favicon)
    // 3. API routes (needed for functionality)
    if (
        path.startsWith('/qa') ||
        path.startsWith('/_next') ||
        path.startsWith('/api') ||
        path.match(/\.(png|jpg|jpeg|svg|ico)$/)
    ) {
        return NextResponse.next();
    }

    // Redirect everything else to /qa
    return NextResponse.redirect(new URL('/qa', request.url));
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
