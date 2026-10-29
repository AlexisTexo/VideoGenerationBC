import type { SupabaseClient } from '@supabase/supabase-js';
import { readSocial, type Social } from './social';

export const FINAL_BUCKET = 'final-videos';

export type SubmissionStatus = 'pending' | 'approved' | 'changes_requested' | 'replaced';

export interface Submission {
  id: string;
  number: number;
  video_id: string;
  project_id: string;
  generation_id: string | null;
  version: number;
  file_path: string;
  poster_path: string;
  file_bytes: number;
  original_bytes: number;
  width: number | null;
  height: number | null;
  seconds: number | null;
  status: SubmissionStatus;
  note: string;
  review_comment: string;
  reviewed_by_email: string;
  reviewed_at: string | null;
  social: unknown;
  uploaded_by_email: string;
  created_at: string;
}

export const SUBMISSION_COLUMNS =
  'id, number, video_id, project_id, generation_id, version, file_path, poster_path, file_bytes, original_bytes, width, height, seconds, status, note, review_comment, reviewed_by_email, reviewed_at, social, uploaded_by_email, created_at';

/** Código visible de una entrega: ENT-00007. */
export const submissionCode = (number: number) => `ENT-${String(number).padStart(5, '0')}`;

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: 'Por aprobar',
  approved: 'Aprobado',
  changes_requested: 'Cambios pedidos',
  replaced: 'Reemplazada',
};

/** Aprobar o pedir cambios: solo administrador y aprobador. */
export const canReview = (role: string | null) => role === 'admin' || role === 'approver';

export const socialOf = (submission: Pick<Submission, 'social'>): Social | null => readSocial(submission.social);

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Orientación del video para elegir el formato de las vistas previas. */
export const isVertical = (s: Pick<Submission, 'width' | 'height'>) => !!s.width && !!s.height && s.height > s.width;

/** URLs firmadas del video y su portada (1 hora). */
export async function signedUrls(
  supabase: SupabaseClient,
  submission: Pick<Submission, 'file_path' | 'poster_path'>,
): Promise<{ video: string; poster: string }> {
  const paths = [submission.file_path, submission.poster_path].filter(Boolean);
  if (!paths.length) return { video: '', poster: '' };
  const { data, error } = await supabase.storage.from(FINAL_BUCKET).createSignedUrls(paths, 3600);
  if (error) console.error('firmar video final falló:', error.message);
  const byPath = new Map((data ?? []).map((row) => [row.path, row.signedUrl]));
  return {
    video: byPath.get(submission.file_path) ?? '',
    poster: submission.poster_path ? (byPath.get(submission.poster_path) ?? '') : '',
  };
}

/** Texto del guion (solo narración) para dar contexto a la IA de redes. */
export function narrationOf(script: unknown): string {
  if (!Array.isArray(script)) return '';
  return script
    .map((scene) => (typeof scene?.narration === 'string' ? scene.narration.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .slice(0, 4000);
}
