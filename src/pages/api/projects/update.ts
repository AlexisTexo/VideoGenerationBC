import type { APIRoute } from 'astro';
import { isUuid, parseProjectForm } from '../../../lib/projects';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.role !== 'admin' && locals.role !== 'editor') {
    return new Response('Prohibido', { status: 403 });
  }

  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  if (!isUuid(id)) {
    return new Response('No encontrado', { status: 404 });
  }

  const data = parseProjectForm(form);
  if (!data) {
    return redirect(`/projects/${id}?error=invalid`, 303);
  }

  const { data: updated, error } = await locals.supabase.from('projects').update(data).eq('id', id).select('id');

  if (error || !updated?.length) {
    console.error('actualizar proyecto falló:', error?.code, error?.message);
    return redirect(`/projects/${id}?error=save`, 303);
  }

  return redirect(`/projects/${id}?ok=1`, 303);
};
