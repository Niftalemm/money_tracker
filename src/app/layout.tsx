import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Money Tracker',
  description: 'Your private monthly expense tracker',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
