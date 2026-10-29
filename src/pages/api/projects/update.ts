import type { APIRoute } from 'astro';
import { isSectionId, isUuid, parseSection } from '../../../lib/projects';
import { deleteLogo, readLogoInput, uploadLogo } from '../../../lib/project-logo';

export const prerender = false;

/** Guarda una sola sección del proyecto; el resto de los campos no se toca. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.role !== 'admin' && locals.role !== 'editor') {
    return new Response('Prohibido', { status: 403 });
  }

  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const section = form.get('section');
  if (!isUuid(id) || !isSectionId(section)) {
    return new Response('No encontrado', { status: 404 });
  }

  const back = (query: string) => redirect(`/projects/${id}?section=${section}&${query}`, 303);

  const data = parseSection(section, form);
  if (!data) {
    return back('error=invalid');
  }

  const { supabase } = locals;
  const { data: current } = await supabase.from('projects').select('logo_url').eq('id', id).maybeSingle();
  if (!current) {
    return new Response('No encontrado', { status: 404 });
  }

  const changes: Record<string, unknown> = { ...data };
  const previousLogo: string = current.logo_url;

  // El logo solo se gestiona desde la sección Producto.
  if (section === 'producto') {
    const logo = await readLogoInput(form);
    if (logo.kind === 'invalid') {
      return back('error=logo');
    }
    if (logo.kind === 'upload') {
      const url = await uploadLogo(supabase, id, logo);
      if (!url) {
        return back('error=logo');
      }
      changes.logo_url = url;
    } else if (logo.kind === 'remove') {
      changes.logo_url = '';
    }
  }

  const { data: updated, error } = await supabase.from('projects').update(changes).eq('id', id).select('id');

  if (error || !updated?.length) {
    console.error('actualizar proyecto falló:', error?.code, error?.message);
    return back('error=save');
  }

  if ('logo_url' in changes && changes.logo_url !== previousLogo && previousLogo) {
    await deleteLogo(supabase, previousLogo);
  }

  return back('ok=1');
};
