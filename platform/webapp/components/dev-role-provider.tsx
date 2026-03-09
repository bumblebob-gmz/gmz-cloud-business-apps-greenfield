'use client';

import { useEffect } from 'react';
import { getDevRole, getDevUserId } from '@/lib/dev-auth-client';

export function DevRoleProvider() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const parsedUrl = new URL(requestUrl, window.location.origin);
      const isSameOrigin = parsedUrl.origin === window.location.origin;
      const isApiCall = parsedUrl.pathname.startsWith('/api/');

      if (!isSameOrigin || !isApiCall) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has('x-user-role')) headers.set('x-user-role', getDevRole());
      if (!headers.has('x-user-id')) headers.set('x-user-id', getDevUserId());

      return originalFetch(input, { ...init, headers });
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
