import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import PwaManager from '@/components/PwaManager';

export const metadata: Metadata = {
  title: {
    default: 'LTT BD — Group travel, in sync',
    template: '%s | LTT BD'
  },
  description:
    'A connected group travel experience for tour organisers and travellers: live location sharing, passenger coordination, trip updates, and help when it matters.',
  applicationName: 'LTT BD',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-512.svg',
    apple: '/icons/icon-192.svg'
  },
  keywords: ['group travel', 'tour management', 'live location sharing', 'travel coordination'],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LTT BD'
  }
};

export const viewport: Viewport = {
  themeColor: '#2450D2',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen flex flex-col antialiased">
        <PwaManager />
        <div className="flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
