import type { APIRoute } from 'astro';
import { resetPreferences } from '../../lib/preferences';
import { isUuid } from '../../lib/projects';

export const prerender = false;

/** Restablece las preferencias recordadas del usuario y vuelve al estudio del proyecto. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const projectId = String(form.get('project_id') ?? '');
  await resetPreferences(locals.supabase, locals.user?.id);
  return redirect(isUuid(projectId) ? `/projects/${projectId}?ok=prefs` : '/', 303);
};
