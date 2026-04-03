'use client';
import { useEffect } from 'react';

export function PwaSplashRemover() {
  useEffect(() => {
    const el = document.getElementById('pwa-splash');
    if (el) el.remove();
  }, []);
  return null;
}
