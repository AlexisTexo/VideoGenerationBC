import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
export const MAX_SECONDS = 600;
/** Lado corto de la copia ligera: 720p (1280×720 en horizontal, 720×1280 en vertical). */
const SHORT_SIDE = 720;

export interface Compressed {
  video: Uint8Array<ArrayBuffer>;
  poster: Uint8Array<ArrayBuffer> | null;
  width: number;
  height: number;
  seconds: number;
  originalBytes: number;
  finalBytes: number;
}

export type CompressResult =
  | { ok: true; result: Compressed }
  | { ok: false; reason: 'no_ffmpeg' | 'invalid' | 'too_long' | 'failed' };

function run(command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (out = (out + chunk).slice(-2000)));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: null, out: 'spawn' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

/** Es el ffmpeg instalado? (en el servidor donde corre la app) */
export async function ffmpegAvailable(): Promise<boolean> {
  const { code } = await run('ffmpeg', ['-version'], 5_000);
  return code === 0;
}

/**
 * Reduce el video a una copia de revisión: 720p, H.264 con CRF 28, audio AAC 96 kbps y moov al inicio
 * para que empiece a reproducirse sin bajar todo el archivo. Genera también una portada.
 * El archivo se escribe a disco en streaming para no cargar videos grandes en memoria.
 */
export async function compressVideo(file: File): Promise<CompressResult> {
  if (!(await ffmpegAvailable())) return { ok: false, reason: 'no_ffmpeg' };

  const dir = await mkdtemp(join(tmpdir(), 'vgbc-'));
  try {
    const input = join(dir, 'input');
    const output = join(dir, 'output.mp4');
    const poster = join(dir, 'poster.jpg');
    await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(input));
    const originalBytes = (await stat(input)).size;

    const probe = await run(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', input],
      30_000,
    );
    let info: { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
    try {
      info = JSON.parse(probe.out);
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    const stream = info.streams?.[0];
    const seconds = Number(info.format?.duration);
    if (probe.code !== 0 || !stream?.width || !stream?.height || !Number.isFinite(seconds) || seconds <= 0) {
      return { ok: false, reason: 'invalid' };
    }
    if (seconds > MAX_SECONDS) return { ok: false, reason: 'too_long' };

    // Sin agrandar: si ya es menor a 720p se conserva el tamaño.
    const scale = `scale='if(gt(iw,ih),-2,min(${SHORT_SIDE},iw))':'if(gt(iw,ih),min(${SHORT_SIDE},ih),-2)'`;
    const encoded = await run(
      'ffmpeg',
      ['-y', '-i', input, '-vf', scale, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', output],
      10 * 60_000,
    );
    if (encoded.code !== 0) {
      console.error('ffmpeg falló:', encoded.out.slice(-400));
      return { ok: false, reason: 'failed' };
    }

    await run('ffmpeg', ['-y', '-ss', String(Math.min(1, seconds / 2)), '-i', output, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', poster], 30_000);

    const final = await probeSize(output);
    const [videoBytes, posterBytes] = await Promise.all([readFile(output), readFile(poster).catch(() => null)]);
    const toBuffer = (b: Buffer) => new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    return {
      ok: true,
      result: {
        video: toBuffer(videoBytes),
        poster: posterBytes ? toBuffer(posterBytes) : null,
        width: final.width,
        height: final.height,
        seconds: Math.round(seconds * 100) / 100,
        originalBytes,
        finalBytes: videoBytes.byteLength,
      },
    };
  } catch (error) {
    console.error('comprimir video falló:', error instanceof Error ? error.message : error);
    return { ok: false, reason: 'failed' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function probeSize(path: string): Promise<{ width: number; height: number }> {
  const { out } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path], 30_000);
  try {
    const stream = JSON.parse(out).streams?.[0];
    return { width: Number(stream?.width) || 0, height: Number(stream?.height) || 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}
