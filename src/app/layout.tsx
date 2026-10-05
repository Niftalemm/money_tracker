import type { Metadata, Viewport } from 'next';
// Self-hosted from node_modules: the CSP allows fonts only from this origin.
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
export const metadata: Metadata = {
  title: 'Money Tracker',
  description: 'Your private monthly expense tracker',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#312e81',
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
