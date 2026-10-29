import type { APIRoute } from 'astro';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();

  if (!EMAIL_RE.test(email)) {
    return redirect('/login?error=email', 303);
  }

  const { error } = await locals.supabase.auth.signInWithOtp({
    email,
    options: {
      // Solo entran usuarios ya invitados desde el panel de Supabase.
      shouldCreateUser: false,
      emailRedirectTo: `${new URL(request.url).origin}/auth/callback`,
    },
  });

  // Correo no invitado: misma respuesta que un envío correcto, para no revelar quién tiene cuenta.
  if (error && error.code !== 'otp_disabled') {
    console.error('signInWithOtp falló:', error.code, error.message);
    return redirect('/login?error=auth', 303);
  }

  return redirect('/login?sent=1', 303);
};
