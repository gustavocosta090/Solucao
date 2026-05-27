import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdminAction = "list_users" | "create_user" | "update_user" | "delete_user" | "reset_password" | "sync_usernames";
const LOGIN_DOMAIN = "solucaotecnica.local";
const DEFAULT_PASSWORD = "123456";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function loginToEmail(value: string) {
  const login = value.trim().toLowerCase();
  return login.includes("@") ? login : `${normalizeUsername(login)}@${LOGIN_DOMAIN}`;
}

function authEmailToUsername(email = "") {
  const value = email.toLowerCase();
  return value.endsWith(`@${LOGIN_DOMAIN}`) ? value.replace(`@${LOGIN_DOMAIN}`, "") : value;
}

function contactEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email.endsWith(`@${LOGIN_DOMAIN}`) ? "" : email;
}

function isGustavoMartins(name: string) {
  return normalizeUsername(name) === "gustavo.martins";
}

function funcaoFromRole(role: string): string {
  const map: Record<string, string> = {
    coordenador: "Coordenador",
    supervisor: "Supervisor",
    agendamento: "Agendamento",
    tecnico: "Técnico",
    auxiliar: "Auxiliar",
    vistoriador: "Vistoriador",
    gerente_comercial: "Gerente Comercial",
    projetista: "Projetista",
    coordenador_projetos: "Coordenador de Projetos",
  };
  return map[role] || role;
}

function usernameFromName(name: string, id: number, used: Set<string>) {
  if (isGustavoMartins(name)) {
    used.add("gustavo");
    return "gustavo";
  }

  const base = normalizeUsername(name) || `usuario.${id}`;
  let candidate = base;
  if (used.has(candidate)) candidate = `${base}.${id}`;
  used.add(candidate);
  return candidate;
}

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureRodrigoVistoriador(adminClient: ReturnType<typeof createClient>) {
  const username = "rodrigo";
  const authEmail = loginToEmail(username);

  const { data: existente } = await adminClient
    .from("tecnicos")
    .select("id, auth_user_id")
    .ilike("nome", "Rodrigo")
    .maybeSingle();

  let userId = existente?.auth_user_id as string | null;

  if (!userId) {
    const authExistente = await findUserByEmail(adminClient, authEmail);
    if (authExistente) {
      userId = authExistente.id;
      await adminClient.auth.admin.updateUserById(userId, {
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      });
    } else {
      const { data: created, error } = await adminClient.auth.admin.createUser({
        email: authEmail,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      });
      if (error || !created.user) throw error || new Error("Não foi possível criar o usuário Rodrigo.");
      userId = created.user.id;
    }
  }

  if (existente?.id) {
    const { error } = await adminClient
      .from("tecnicos")
      .update({ auth_user_id: userId, role: "vistoriador", email: null })
      .eq("id", existente.id);
    if (error) throw error;
    return;
  }

  const { error } = await adminClient
    .from("tecnicos")
    .insert({ nome: "Rodrigo", auth_user_id: userId, role: "vistoriador", funcao: "Vistoriador", tipo_usuario: "vistoriador", email: null });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("PUBLIC_ANON_KEY");
  const serviceRoleKey = Deno.env.get("ADMIN_SECRET_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Variáveis de ambiente do Supabase não configuradas." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

  const { data: requester, error: requesterError } = await adminClient
    .from("tecnicos")
    .select("role")
    .eq("auth_user_id", authData.user.id)
    .single();

  if (requesterError || requester?.role !== "coordenador") {
    return json({ error: "Acesso restrito ao coordenador." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as AdminAction;

  if (action === "list_users") {
    const { data: tecnicos, error: tecnicosError } = await adminClient
      .from("tecnicos")
      .select("id, nome, role, email, auth_user_id, tecnico_equipes(equipes(nome))")
      .order("nome");

    if (tecnicosError) return json({ error: tecnicosError.message }, 400);

    const authUsersById = new Map<string, string>();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return json({ error: error.message }, 400);
      data.users.forEach((user) => {
        if (user.id && user.email) authUsersById.set(user.id, user.email);
      });
      if (data.users.length < 1000) break;
    }

    return json({
      ok: true,
      users: (tecnicos || []).map((tecnico) => {
        const authEmail = tecnico.auth_user_id ? authUsersById.get(tecnico.auth_user_id) || "" : "";
        return {
          ...tecnico,
          email: contactEmail(tecnico.email),
          username: authEmail ? authEmailToUsername(authEmail) : "",
        };
      }),
    });
  }

  if (action === "create_user") {
    const tecnicoId = Number(body.tecnicoId || 0);
    const nome = String(body.nome || "").trim();
    const username = normalizeUsername(String(body.username || ""));
    const email = loginToEmail(username);
    const password = String(body.password || "");
    const role = String(body.role || "tecnico");
    const emailContato = contactEmail(body.email);

    if ((!tecnicoId && nome.length < 2) || username.length < 3 || password.length < 6 || !emailContato) {
      return json({ error: "Dados inválidos para criação do usuário." }, 400);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      return json({ error: createError?.message || "Não foi possível criar o usuário." }, 400);
    }

    const savePayload = { auth_user_id: created.user.id, email: emailContato, role, funcao: funcaoFromRole(role), tipo_usuario: role };
    const saveResult = tecnicoId
      ? await adminClient.from("tecnicos").update(savePayload).eq("id", tecnicoId)
      : await adminClient.from("tecnicos").insert({ ...savePayload, nome });

    if (saveResult.error) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: saveResult.error.message }, 400);
    }

    return json({ ok: true, userId: created.user.id });
  }

  if (action === "update_user") {
    const tecnicoId = Number(body.tecnicoId);
    const userId = String(body.userId || "");
    const nome = String(body.nome || "").trim();
    const username = normalizeUsername(String(body.username || ""));
    const password = String(body.password || "");
    const role = String(body.role || "tecnico");
    const emailContato = contactEmail(body.email);

    if (!tecnicoId || !userId || nome.length < 2 || username.length < 3 || !emailContato) {
      return json({ error: "Dados inválidos para edição do usuário." }, 400);
    }

    const authPayload: Record<string, unknown> = {
      email: loginToEmail(username),
      email_confirm: true,
    };
    if (password) {
      if (password.length < 6) return json({ error: "A senha deve ter pelo menos 6 caracteres." }, 400);
      authPayload.password = password;
    }

    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authPayload);
    if (authUpdateError) return json({ error: authUpdateError.message }, 400);

    const { error: updateError } = await adminClient
      .from("tecnicos")
      .update({ nome, email: emailContato, role, funcao: funcaoFromRole(role), tipo_usuario: role })
      .eq("id", tecnicoId);

    if (updateError) return json({ error: updateError.message }, 400);

    return json({ ok: true });
  }

  if (action === "delete_user") {
    const tecnicoId = Number(body.tecnicoId);
    const userId = String(body.userId || "");
    const nome = String(body.nome || "");

    if (!tecnicoId || !userId) return json({ error: "Usuário inválido para apagar." }, 400);
    if (isGustavoMartins(nome)) return json({ error: "O usuário Gustavo Martins não pode ser apagado por esta tela." }, 400);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 400);

    const { error: updateError } = await adminClient
      .from("tecnicos")
      .update({ auth_user_id: null })
      .eq("id", tecnicoId);

    if (updateError) return json({ error: updateError.message }, 400);

    return json({ ok: true });
  }

  if (action === "reset_password") {
    const userId = String(body.userId || "");
    const password = String(body.password || "");
    if (!userId || password.length < 6) {
      return json({ error: "Dados inválidos para redefinição de senha." }, 400);
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  }

  if (action === "sync_usernames") {
    await ensureRodrigoVistoriador(adminClient);

    const { data: tecnicos, error: tecnicosError } = await adminClient
      .from("tecnicos")
      .select("id, nome, role, email, auth_user_id")
      .order("nome");

    if (tecnicosError) return json({ error: tecnicosError.message }, 400);

    const used = new Set<string>();
    const results = [];

    for (const tecnico of tecnicos || []) {
      const username = usernameFromName(String(tecnico.nome || ""), Number(tecnico.id), used);
      const email = loginToEmail(username);
      const isGustavo = isGustavoMartins(String(tecnico.nome || ""));
      const role = isGustavo ? "coordenador" : String(tecnico.role || "tecnico");
      const emailContato = contactEmail(tecnico.email);

      try {
        let userId = tecnico.auth_user_id as string | null;

        if (isGustavo && !userId) {
          const existing = await findUserByEmail(adminClient, email);
          userId = existing?.id || null;
          if (!userId) {
            throw new Error("Gustavo Martins precisa manter a senha atual, mas não encontrei o usuário Auth vinculado.");
          }
        }

        if (userId) {
          const updatePayload = isGustavo ? {
            email,
            email_confirm: true,
          } : {
            email,
            password: DEFAULT_PASSWORD,
            email_confirm: true,
          };
          const { error } = await adminClient.auth.admin.updateUserById(userId, updatePayload);
          if (error) throw error;
        } else {
          const existing = await findUserByEmail(adminClient, email);

          if (existing) {
            userId = existing.id;
            const { error } = await adminClient.auth.admin.updateUserById(userId, {
              password: DEFAULT_PASSWORD,
              email_confirm: true,
            });
            if (error) throw error;
          } else {
            const { data: created, error } = await adminClient.auth.admin.createUser({
              email,
              password: DEFAULT_PASSWORD,
              email_confirm: true,
            });
            if (error || !created.user) throw error || new Error("Usuário não criado.");
            userId = created.user.id;
          }
        }

        const { error: updateError } = await adminClient
          .from("tecnicos")
          .update({ auth_user_id: userId, email: emailContato || null, role })
          .eq("id", tecnico.id);

        if (updateError) throw updateError;

        results.push({ id: tecnico.id, nome: tecnico.nome, username, ok: true });
      } catch (error) {
        results.push({
          id: tecnico.id,
          nome: tecnico.nome,
          username,
          ok: false,
          error: error instanceof Error ? error.message : "Erro desconhecido.",
        });
      }
    }

    const failed = results.filter((r) => !r.ok);
    return json({
      ok: failed.length === 0,
      password: DEFAULT_PASSWORD,
      total: results.length,
      success: results.length - failed.length,
      failed,
      results,
    }, failed.length ? 207 : 200);
  }

  return json({ error: "Ação inválida." }, 400);
});
