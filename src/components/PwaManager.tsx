'use client';

import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silent fallback if SW registration is blocked in dev
      });
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIos(iosDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone || dismissed) return null;

  if (!deferredPrompt && !isIos) return null;

  return (
    <div className="ltt-install-banner bg-brand-900 text-white px-4 py-2.5 text-xs flex items-center justify-between gap-3 shadow-md z-40">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-blue-300 shrink-0" />
        {deferredPrompt ? (
          <span>Install <strong>LTT BD</strong> on your home screen for quick one-tap tour access.</span>
        ) : (
          <span>
            iPhone Safari: Tap <strong>Share</strong> &rarr; <strong>Add to Home Screen</strong> to install LTT BD.
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {deferredPrompt && (
          <button
            type="button"
            onClick={async () => {
              await deferredPrompt.prompt();
              setDeferredPrompt(null);
            }}
            className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-3 py-1 rounded-md flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            Install App
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-blue-200 hover:text-white p-1"
          aria-label="Dismiss install banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
