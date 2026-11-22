'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Wifi, Check, Copy, ExternalLink } from 'lucide-react';
import { generateQrMatrix } from '@/lib/qrcode';

interface RealQrCodeProps {
  value: string;
  size?: number;
  label?: string;
  sublabel?: string;
  darkColor?: string;
  lightColor?: string;
  showDownload?: boolean;
}

export default function RealQrCode({
  value,
  size = 185,
  label,
  sublabel,
  darkColor = '#000000',
  lightColor = '#ffffff',
  showDownload = true
}: RealQrCodeProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [lanOrigin, setLanOrigin] = useState<string | null>(null);
  const [pageOrigin, setPageOrigin] = useState<string>('');
  const [customUrl, setCustomUrl] = useState<string>('');
  const [imgLoaded, setImgLoaded] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setPageOrigin(window.location.origin);
    fetch('/api/network-info')
      .then((r) => r.json())
      .then((data) => {
        if (active && data?.lanOrigin) {
          setLanOrigin(data.lanOrigin);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const effectiveUrl = useMemo(() => {
    if (customUrl.trim()) return customUrl.trim();
    const raw = value || pageOrigin || 'LTT BD';
    if (lanOrigin && (raw.includes('localhost:3000') || raw.includes('127.0.0.1:3000'))) {
      return raw
        .replace('http://localhost:3000', lanOrigin)
        .replace('http://127.0.0.1:3000', lanOrigin);
    }
    return raw;
  }, [value, lanOrigin, customUrl, pageOrigin]);

  const matrix = useMemo(() => generateQrMatrix(effectiveUrl), [effectiveUrl]);
  const n = matrix.length;
  const quietZone = 4;
  const totalModules = n + quietZone * 2;

  const qrApiImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&margin=10&ecc=M&data=${encodeURIComponent(
    effectiveUrl
  )}`;

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(label || 'LTT-BD-QR').replace(/[^a-z0-9]+/gi, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(effectiveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="inline-flex flex-col items-center bg-white p-4 rounded-3xl shadow-xl border border-slate-200 max-w-full">
      <div className="p-2.5 rounded-2xl bg-white border-2 border-slate-900/10 shadow-inner relative">
        {/* Primary High-Contrast Scannable QR Image with Instant Offline SVG Matrix Fallback */}
        {imgLoaded && (
          <img
            src={qrApiImgUrl}
            alt={label || 'LTT BD QR Code'}
            width={size}
            height={size}
            onError={() => setImgLoaded(false)}
            className="block rounded-lg"
          />
        )}
        <svg
          ref={svgRef}
          width={size}
          height={size}
          viewBox={`0 0 ${totalModules} ${totalModules}`}
          shapeRendering="crispEdges"
          role="img"
          aria-label={label || `QR Code for ${effectiveUrl}`}
          className={imgLoaded ? 'hidden' : 'block rounded-lg'}
        >
          <rect width={totalModules} height={totalModules} fill={lightColor} />
          {matrix.map((row, rIdx) =>
            row.map((cell, cIdx) =>
              cell ? (
                <rect
                  key={`${rIdx}-${cIdx}`}
                  x={cIdx + quietZone}
                  y={rIdx + quietZone}
                  width={1}
                  height={1}
                  fill={darkColor}
                />
              ) : null
            )
          )}
        </svg>
      </div>

      {label && (
        <div className="mt-2.5 text-xs font-extrabold text-slate-900 tracking-tight text-center">
          {label}
        </div>
      )}
      {sublabel && (
        <div className="text-[11px] font-mono font-bold text-brand-700 text-center">
          {sublabel}
        </div>
      )}

      <div className="mt-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 flex items-center gap-1 max-w-[230px] truncate">
        <Wifi className="w-3 h-3 shrink-0" />
        <span className="truncate">{effectiveUrl}</span>
      </div>

      {showDownload && (
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-extrabold text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1 rounded-full flex items-center gap-1 transition shadow-sm"
          >
            <ExternalLink className="w-3 h-3" />
            Open Link
          </a>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="text-[11px] font-bold text-slate-700 hover:text-brand-700 bg-slate-100 hover:bg-brand-50 px-2.5 py-1 rounded-full flex items-center gap-1 transition"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownloadSvg}
            className="text-[11px] font-bold text-slate-700 hover:text-brand-700 bg-slate-100 hover:bg-brand-50 px-2.5 py-1 rounded-full flex items-center gap-1 transition"
          >
            <Download className="w-3 h-3" />
            Save
          </button>
        </div>
      )}
    </div>
  );
}
