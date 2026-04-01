'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient, persistAccessTokenCookie } from '@/lib/supabase';

export default function AuthSessionSync() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      persistAccessTokenCookie(data.session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      persistAccessTokenCookie(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}