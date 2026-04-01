import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

interface AuthResult {
  userId: string;
}

export function requireApiKey(req: Request, res: Response): boolean {
  const secret = process.env['BACKEND_API_SECRET'];
  if (!secret) {
    res.status(500).json({ ok: false, error: 'Server misconfiguration' });
    return false;
  }

  const provided = req.header('x-api-key');
  if (provided !== secret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }

  return true;
}

export async function requireSupabaseAuth(
  req: Request,
  res: Response
): Promise<AuthResult | null> {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseServiceKey =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ ok: false, error: 'Server misconfiguration: Supabase env vars missing' });
    return null;
  }

  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing or invalid Authorization header' });
    return null;
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  return { userId: user.id };
}
