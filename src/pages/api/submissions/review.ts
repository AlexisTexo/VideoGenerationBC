import type { APIRoute } from 'astro';
import { AiError } from '../../../lib/gemini';
import { isUuid } from '../../../lib/projects';
import { writeSocial } from '../../../lib/submission-social';
import { SUBMISSION_COLUMNS, canReview, type Submission } from '../../../lib/submissions';

export const prerender = false;

/**
 * Aprobar o pedir cambios. Solo administrador y aprobador, y solo sobre una entrega por aprobar.
 * Al aprobar se escriben los textos para YouTube, Meta y TikTok; si la IA falla, queda aprobada
 * igual y los textos se piden de nuevo desde la pantalla de la entrega.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canReview(locals.role)) return new Response('Prohibido', { status: 403 });

  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const decision = String(form.get('decision') ?? '');
  const comment = String(form.get('comment') ?? '').trim().slice(0, 1000);
  if (!isUuid(id) || !['approve', 'changes'].includes(decision)) return new Response('No encontrado', { status: 404 });

  const { supabase } = locals;
  const { data } = await supabase.from('submissions').select(SUBMISSION_COLUMNS).eq('id', id).maybeSingle();
  const submission = data as unknown as Submission | null;
  if (!submission) return new Response('No encontrado', { status: 404 });

  const back = (query: string) => redirect(`/approvals/${id}?${query}`, 303);
  if (submission.status !== 'pending') return back('error=resolved');
  if (decision === 'changes' && !comment) return back('error=comment');

  const { data: updated, error } = await supabase
    .from('submissions')
    .update({
      status: decision === 'approve' ? 'approved' : 'changes_requested',
      review_comment: comment,
      reviewed_by_email: (locals.user?.email ?? '').slice(0, 200),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    console.error('revisar entrega falló:', error.code, error.message);
    return back('error=save');
  }
  if (!updated?.length) return back('error=resolved');

  if (decision === 'changes') return back('ok=changes');

  try {
    await writeSocial(supabase, submission);
    return back('ok=approved');
  } catch (error) {
    console.error('textos de redes fallaron:', error instanceof Error ? error.message : error);
    const detail = error instanceof AiError && error.code === 'config' ? 'config' : 'ai';
    return back(`ok=approved&error=social_${detail}`);
  }
};
