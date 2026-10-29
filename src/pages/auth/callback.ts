import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');

  if (!code) {
    return redirect('/login?error=auth');
  }

  const { error } = await locals.supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('exchangeCodeForSession falló:', error.code, error.message);
    return redirect('/login?error=auth');
  }

  return redirect('/');
};
