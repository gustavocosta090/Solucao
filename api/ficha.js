// api/ficha.js — retorna os dados de uma ficha para assinatura pública (por token)
// build: 2026-06-25a
// GET /api/ficha?t=<uuid> -> { status, ficha } | 404
// Consumido por assinar.html (página pública). NÃO exige sessão — a validação é pelo token.

const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

// Só campos necessários para exibir a ficha — não expõe IP/assinatura/selfie ao público.
const SELECT = 'id,tipo,colaborador_nome,funcao,empresa,setor,data_admissao,n_registro,itens,declaracao,status,expira_em,assinado_em';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = String(req.query.t || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{10,40}$/.test(token)) return res.status(400).json({ error: 'token inválido' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/fichas_assinatura?token=eq.${token}&select=${encodeURIComponent(SELECT)}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!r.ok) return res.status(500).json({ error: 'Erro ao buscar a ficha' });

    const rows = await r.json();
    const f = Array.isArray(rows) && rows[0];
    if (!f) return res.status(404).json({ error: 'Ficha não encontrada' });

    if (f.status === 'assinada') return res.status(200).json({ status: 'assinada', ficha: f });
    if (f.expira_em && new Date(f.expira_em) < new Date()) return res.status(200).json({ status: 'expirada', ficha: f });
    return res.status(200).json({ status: 'pendente', ficha: f });

  } catch (e) {
    console.error('[api/ficha]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
