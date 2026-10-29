import type { APIRoute } from 'astro';
import { isUuid, parseProjectForm } from '../../../lib/projects';
import { deleteLogo, readLogoInput, uploadLogo } from '../../../lib/project-logo';

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

  const { supabase } = locals;
  const { data: current } = await supabase.from('projects').select('logo_url').eq('id', id).maybeSingle();
  if (!current) {
    return new Response('No encontrado', { status: 404 });
  }

  const logo = await readLogoInput(form);
  if (logo.kind === 'invalid') {
    return redirect(`/projects/${id}?error=logo`, 303);
  }

  let logoUrl: string = current.logo_url;
  if (logo.kind === 'upload') {
    const url = await uploadLogo(supabase, id, logo);
    if (!url) {
      return redirect(`/projects/${id}?error=logo`, 303);
    }
    logoUrl = url;
  } else if (logo.kind === 'remove') {
    logoUrl = '';
  }

  const { data: updated, error } = await supabase
    .from('projects')
    .update({ ...data, logo_url: logoUrl })
    .eq('id', id)
    .select('id');

  if (error || !updated?.length) {
    console.error('actualizar proyecto falló:', error?.code, error?.message);
    return redirect(`/projects/${id}?error=save`, 303);
  }

  if (logoUrl !== current.logo_url && current.logo_url) {
    await deleteLogo(supabase, current.logo_url);
  }

  return redirect(`/projects/${id}?ok=1`, 303);
};
