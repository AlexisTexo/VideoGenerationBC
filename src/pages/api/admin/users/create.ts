import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../../lib/supabase-admin';
import { isRole } from '../../../../lib/roles';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const role = form.get('role');

  if (!EMAIL_RE.test(email) || !isRole(role)) {
    return redirect('/admin/users?error=invalid', 303);
  }

  const admin = createAdminClient();

  // Usuario sin contraseña, ya confirmado: entra con el enlace de acceso de /login.
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });

  if (error || !data.user) {
    console.error('createUser falló:', error?.code, error?.message);
    return redirect(`/admin/users?error=${error?.code === 'email_exists' ? 'exists' : 'create'}`, 303);
  }

  // El trigger ya creó el perfil como editor; aquí se fija el rol elegido.
  const { error: roleError } = await admin
    .from('profiles')
    .upsert({ id: data.user.id, email, role }, { onConflict: 'id' });

  if (roleError) {
    console.error('asignar rol falló:', roleError.code, roleError.message);
    return redirect('/admin/users?error=role', 303);
  }

  return redirect('/admin/users?ok=created', 303);
};
