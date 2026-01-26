// Force all protected routes to be dynamically rendered
// This avoids useSearchParams SSG errors in Next.js 16+
export const dynamic = 'force-dynamic';

export default function ProtectedTemplate({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
