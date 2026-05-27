# admin-users

Edge Function para operações administrativas de usuários sem expor `service_role` no front-end.

## Deploy

1. Rotacione a `service_role` que estava exposta no `admin.html`.
2. Configure os secrets no Supabase:

```bash
supabase secrets set SUPABASE_URL="https://kxtjqudpnmdqkzqhyhmz.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="SUA_ANON_KEY"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="SUA_NOVA_SERVICE_ROLE_KEY"
```

3. Faça o deploy:

```bash
supabase functions deploy admin-users
```

O front chama `https://kxtjqudpnmdqkzqhyhmz.functions.supabase.co/admin-users`
enviando o token da sessão do coordenador no header `Authorization`.
