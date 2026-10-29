import type { APIRoute } from 'astro';
import { AiError } from '../../../lib/gemini';
import { isUuid } from '../../../lib/projects';
import { writeSocial } from '../../../lib/submission-social';
import { normalizeSocial } from '../../../lib/social';
import { SUBMISSION_COLUMNS, type Submission } from '../../../lib/submissions';

export const prerender = false;

const splitList = (value: FormDataEntryValue | null) =>
  String(value ?? '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Textos de redes de una entrega aprobada. `action=regenerate` los vuelve a pedir a la IA;
 * `action=save` guarda los que se editaron a mano (con los mismos límites).
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const role = locals.role;
  if (role !== 'admin' && role !== 'editor' && role !== 'approver') return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  if (!isUuid(id) || !['regenerate', 'save'].includes(action)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data } = await supabase.from('submissions').select(SUBMISSION_COLUMNS).eq('id', id).maybeSingle();
  const submission = data as unknown as Submission | null;
  if (!submission) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/approvals/${id}?${query}#redes`, 303);
  if (submission.status !== 'approved') return back('error=not_approved');

  if (action === 'regenerate') {
    try {
      await writeSocial(supabase, submission);
      return back('ok=social');
    } catch (error) {
      console.error('regenerar textos falló:', error instanceof Error ? error.message : error);
      return back(`error=social_${error instanceof AiError && error.code === 'config' ? 'config' : 'ai'}`);
    }
  }

  const { social } = normalizeSocial({
    youtube: {
      title: form.get('yt_title'),
      description: form.get('yt_description'),
      tags: splitList(form.get('yt_tags')),
      hashtags: splitList(form.get('yt_hashtags')),
    },
    meta: { caption: form.get('meta_caption'), hashtags: splitList(form.get('meta_hashtags')) },
    tiktok: { caption: form.get('tt_caption'), hashtags: splitList(form.get('tt_hashtags')) },
  });
  const { error } = await supabase.from('submissions').update({ social }).eq('id', id);
  if (error) {
    console.error('guardar textos falló:', error.code, error.message);
    return back('error=save');
  }
  return back('ok=social_saved');
};
