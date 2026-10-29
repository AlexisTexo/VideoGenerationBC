import { defineMiddleware } from 'astro:middleware';
import { createClient, hasSupabaseEnv } from './lib/supabase';
import { isRole } from './lib/roles';

const PUBLIC_PATHS = new Set(['/login', '/auth/callback', '/api/auth/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (!hasSupabaseEnv()) {
    return new Response(
      'Falta configurar Supabase: define PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY en .env y reinicia el servidor.',
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const supabase = createClient(context);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.supabase = supabase;
  context.locals.user = user;
  context.locals.role = null;

  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!user && !isPublic) {
    return context.redirect('/login');
  }

  if (user) {
    if (pathname === '/login') {
      return context.redirect('/');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    context.locals.role = isRole(profile?.role) ? profile.role : null;

    const isAdminArea = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    if (isAdminArea && context.locals.role !== 'admin') {
      return pathname.startsWith('/api/')
        ? new Response('Prohibido', { status: 403 })
        : context.redirect('/');
    }
  }

  return next();
});
