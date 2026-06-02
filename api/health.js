// SAOS-AUDIT: build 2026-06-01 pós-auditoria
// api/health.js — health check do sistema SAOS
// GET /api/health → JSON com status de cada dependência
// Usado por monitoramento externo (UptimeRobot, BetterUptime, etc.)
// Não expõe credenciais — apenas estado de conectividade.

import { getToken, getSiteId } from './_sharepoint.js';

const SUPABASE_URL      = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

async function checkSupabase() {
  const start = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/obras?select=id&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    return { ok: res.status === 200 || res.status === 401, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e.message };
  }
}

async function checkSharePoint() {
  const start = Date.now();
  try {
    const token  = await getToken();
    const siteId = await getSiteId(token);
    return { ok: !!siteId, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const [supabase, sharepoint] = await Promise.all([
    checkSupabase(),
    checkSharePoint(),
  ]);

  const allOk   = supabase.ok && sharepoint.ok;
  const payload = {
    status:    allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: { supabase, sharepoint },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(allOk ? 200 : 503).json(payload);
}
