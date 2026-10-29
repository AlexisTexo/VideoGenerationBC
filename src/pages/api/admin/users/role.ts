import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../../lib/supabase-admin';
import { isRole } from '../../../../lib/roles';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const role = form.get('role');

  if (!id || !isRole(role)) {
    return redirect('/admin/users?error=invalid', 303);
  }

  // Evita que el admin se quite el acceso a sí mismo y deje el sistema sin administradores.
  if (id === locals.user?.id) {
    return redirect('/admin/users?error=self', 303);
  }

  const { error } = await createAdminClient().from('profiles').update({ role }).eq('id', id);

  if (error) {
    console.error('cambiar rol falló:', error.code, error.message);
    return redirect('/admin/users?error=role', 303);
  }

  return redirect('/admin/users?ok=role', 303);
};
