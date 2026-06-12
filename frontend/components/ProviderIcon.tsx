import React, { useState } from 'react';
import Image from 'next/image';

export interface ProviderIconProps {
  src: string;
  alt: string;
  fallbackText?: string;
  fallbackColor?: string;
  size?: number;
  className?: string;
}

export function ProviderIcon({
  src,
  alt,
  fallbackText,
  fallbackColor = '#6B7280',
  size = 32,
  className = '',
}: ProviderIconProps) {
  const [error, setError] = useState(false);

  if (error || !src) {
    const text = fallbackText || alt.slice(0, 2).toUpperCase();
    return (
      <div
        className={`flex items-center justify-center font-semibold text-white rounded-lg ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: fallbackColor,
          fontSize: size * 0.4,
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`object-contain rounded-lg ${className}`}
      onError={() => setError(true)}
    />
  );
}
