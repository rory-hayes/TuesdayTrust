'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';

import { setApiAuthTokenGetter } from '../lib/api';

export function ClerkApiAuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setApiAuthTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });

    return () => {
      setApiAuthTokenGetter(null);
    };
  }, [getToken]);

  return null;
}
