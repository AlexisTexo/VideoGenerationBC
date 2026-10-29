import type { APIRoute } from 'astro';
import { parseProjectForm } from '../../../lib/projects';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.role !== 'admin' && locals.role !== 'editor') {
    return new Response('Prohibido', { status: 403 });
  }

  const data = parseProjectForm(await request.formData());
  if (!data) {
    return redirect('/projects/new?error=invalid', 303);
  }

  const { data: created, error } = await locals.supabase.from('projects').insert(data).select('id').single();

  if (error || !created) {
    console.error('crear proyecto falló:', error?.code, error?.message);
    return redirect('/projects/new?error=save', 303);
  }

  return redirect(`/projects/${created.id}?ok=1`, 303);
};
