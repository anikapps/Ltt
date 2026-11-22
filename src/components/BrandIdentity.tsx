import React from 'react';

interface BrandIdentityProps {
  className?: string;
  tagline?: string;
  variant?: 'default' | 'light';
  compact?: boolean;
}

/** A compact, accessible LTT BD wordmark and route-inspired brand mark. */
export default function BrandIdentity({
  className = '',
  tagline = 'Group travel, in sync',
  variant = 'default',
  compact = false
}: BrandIdentityProps) {
  return (
    <span className={`ltt-brand${variant === 'light' ? ' is-light' : ''}${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}>
      <span className="ltt-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="24" height="24" fill="none">
          <path d="M8 29C13 29 14 22 19 22C24 22 24 12 32 10" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="8" cy="29" r="3.2" fill="#8EF0D4" stroke="white" strokeWidth="1.2" />
          <path d="M32 5.8C28.9 5.8 26.4 8.3 26.4 11.4C26.4 15.7 32 20.2 32 20.2C32 20.2 37.6 15.7 37.6 11.4C37.6 8.3 35.1 5.8 32 5.8Z" fill="white" fillOpacity=".98" transform="translate(-1.5 0) scale(.88)" />
          <circle cx="26.7" cy="10" r="1.7" fill="#315CE8" />
        </svg>
      </span>
      <span className="ltt-brand-copy">
        <span className="ltt-brand-name">LTT <b>BD</b></span>
        {tagline && <small>{tagline}</small>}
      </span>
    </span>
  );
}
