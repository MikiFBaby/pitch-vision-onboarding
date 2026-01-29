import { Metadata } from 'next';

export const metadata: Metadata = {
    title: "QA Dashboard | PitchVision",
    description: "Real-time call quality monitoring, compliance analytics, and AI-powered insights for your sales team.",
};

export default function QALayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
