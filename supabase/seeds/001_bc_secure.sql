-- Primer proyecto: BC Secure (https://bcsecure.bcareconsulting.com/).
-- Fuente: sitio web, "PRD Plataforma de Gestión de Guardias v1.0" y "Propuesta de valor".
-- Ejecutar DESPUÉS de 0002_projects.sql. Es idempotente: no duplica el proyecto.

insert into public.projects (
  name, description,
  color_primary, color_secondary, color_accent, color_background, color_text,
  voice_id, voice_name, voice_style, language,
  audience, content_tone, topics, rules, call_to_action,
  subtitle_font, subtitle_position, subtitle_text_color, subtitle_highlight_color,
  subtitle_uppercase, subtitle_words_per_line,
  platforms, default_aspect
)
select
  'BC Secure',
  $$Software para empresas de seguridad privada, desarrollado por BCare Consulting. Centraliza asistencia con GPS, rondines con QR, consignas, incidentes y reportes en una sola plataforma: app Android para guardias y centro de control web para supervisores. Convierte cada operación de seguridad en cumplimiento verificable: de "tener guardias asignados" a demostrar que el servicio se cumple.$$,
  '#7C05F2', '#2B88D9', '#798BF2', '#0F0C1A', '#F2F2F2',
  '', '',
  $$Voz clara y segura, ritmo medio, sin dramatismo. Profesional pero cercana. Español de México neutro.$$,
  'es-MX',
  $$Dueños, gerentes de operaciones, coordinadores de centro de control y supervisores de empresas de seguridad privada en México (aprox. 50 a 500 guardias en varias instalaciones, sobre todo sectores industrial y logístico). Secundario: clientes que contratan seguridad y necesitan evidencia del servicio.$$,
  $$Directo, práctico y confiado; enfocado en resultados. Tutea al espectador. Frases cortas. Usa términos como app, check-in y PDF/CSV/XLSX tal cual. Ejemplos de estilo: "sin llamar a nadie", "datos, no promesas".$$,
  $$Controla a tu personal de seguridad en tiempo real (mapa, cobertura, turnos)
Asistencia con GPS y geocercas: check-in/check-out, retardos y faltas automáticos
Rondines con QR: checkpoints, ventanas de tiempo y evidencia
Consignas y bitácora digital con fotos, video y notas de voz
Incidentes: reporte, escalamiento, atención y cierre con trazabilidad
Reportes y evidencia para el cliente (PDF, CSV, XLSX)
Dolores del día a día: rondines omitidos, registros en papel, supervisión reactiva, información dispersa
De tener guardias asignados a demostrar que el servicio se cumple
Roles, permisos por cliente y auditoría de acciones$$,
  $$No prometer porcentajes, ahorros ni resultados garantizados: aún no hay datos de pilotos.
No mencionar precios ni planes (son hipótesis).
No afirmar ubicación dentro de edificios ni "prueba infalible" contra fraude de GPS o QR.
Presentar como disponible solo lo que aparece en el sitio web. Portal del cliente, SLA por contrato, planos interiores, integraciones (CCTV, sensores) y analítica predictiva son hoja de ruta: confirmar con el equipo antes de mencionarlos.
Mostrar guardias, supervisores y pantallas de forma profesional; sin armas, violencia ni datos personales reales.$$,
  $$Solicita tu demo gratuita en bcsecure.bcareconsulting.com$$,
  'Montserrat', 'bottom', '#FFFFFF', '#8D44F2',
  false, 3,
  '{youtube,instagram,facebook}', '9:16'
where not exists (select 1 from public.projects where name = 'BC Secure');
