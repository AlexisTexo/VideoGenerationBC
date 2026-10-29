import type { APIRoute } from 'astro';
import { parseProjectForm } from '../../../lib/projects';
import { readLogoInput, uploadLogo } from '../../../lib/project-logo';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.role !== 'admin' && locals.role !== 'editor') {
    return new Response('Prohibido', { status: 403 });
  }

  const form = await request.formData();
  const data = parseProjectForm(form);
  if (!data) {
    return redirect('/projects/new?error=invalid', 303);
  }

  const logo = await readLogoInput(form);
  if (logo.kind === 'invalid') {
    return redirect('/projects/new?error=logo', 303);
  }

  const { data: created, error } = await locals.supabase.from('projects').insert(data).select('id').single();

  if (error || !created) {
    console.error('crear proyecto falló:', error?.code, error?.message);
    return redirect('/projects/new?error=save', 303);
  }

  if (logo.kind === 'upload') {
    const url = await uploadLogo(locals.supabase, created.id, logo);
    if (!url) {
      return redirect(`/projects/${created.id}?error=logo`, 303);
    }
    await locals.supabase.from('projects').update({ logo_url: url }).eq('id', created.id);
  }

  return redirect(`/projects/${created.id}?ok=1`, 303);
};
