import type { Metadata, Viewport } from 'next';
// Self-hosted from node_modules: the CSP allows fonts only from this origin.
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './globals.css';
import InputModality from '@/components/InputModality';
export const metadata: Metadata = {
  title: 'Money Tracker',
  description: 'Your private monthly expense tracker',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#121211' },
  ],
};
export const dynamic = 'force-dynamic';
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <InputModality />
        {children}
      </body>
    </html>
  );
}
