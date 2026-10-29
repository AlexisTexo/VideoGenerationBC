-- Base de conocimiento de BC Secure, resumida del PRD v1.0 y la Propuesta de valor (octubre 2026).
-- Ejecutar DESPUÉS de 0004_project_knowledge.sql. No pisa conocimiento ya escrito.

update public.projects
set knowledge = $$## Qué es
Plataforma SaaS para empresas de seguridad privada. Convierte turnos, rondines, consignas e incidentes en evidencia operativa verificable. Posicionamiento: Security Operations & Compliance Management, no solo software de rondines. Desarrollado por BCare Consulting. Mercado inicial: México.

## Piezas del producto
- App Android para guardias: turnos, check-in/check-out, rondines, consignas, evidencias, incidentes y botón SOS.
- Centro de control web para supervisores: mapa, cobertura, alertas, asignaciones y analítica.
- Portal del cliente (hoja de ruta): visibilidad acotada a sus instalaciones, reportes, cumplimiento e incidentes.
- Multi-tenant: datos aislados por empresa, permisos por rol y auditoría.

## Problemas que resuelve
- Supervisión limitada: las desviaciones son difíciles de detectar.
- Registros manuales: la evidencia queda incompleta o dispersa en bitácoras y mensajes.
- Rondines omitidos: riesgo operativo y contractual.
- Poca transparencia: cuesta demostrar la calidad del servicio al cliente.

## Cómo funciona (flujos)
- Inicio de turno: el guardia consulta su turno y hace check-in; el centro de control actualiza la cobertura.
- Rondín: el guardia escanea puntos QR y registra evidencia; el sistema evalúa el cumplimiento y avisa al supervisor de excepciones.
- Incidente: el guardia lo registra con evidencia, se crea una alerta, el supervisor lo atiende y lo cierra con trazabilidad.

## Reglas de negocio útiles para explicar
- Un puesto está cubierto solo si hay asignación válida y check-in aceptado dentro de la ventana: se distingue "asignado" de "presente".
- Un rondín cuenta como cumplido si todos los checkpoints obligatorios se registran dentro de la ventana; también se registra el cumplimiento parcial.
- Las correcciones manuales nunca sobrescriben el evento original: generan una nueva versión con quién, cuándo y por qué.
- La app funciona sin conexión y sincroniza después sin duplicar eventos.
- Estados de un incidente: abierto, reconocido, en atención, resuelto, cerrado.

## Indicadores que mide
Cobertura de puestos, rondines cumplidos, consignas ejecutadas, incidentes dentro de SLA, ausentismo, tiempo de respuesta y cumplimiento por instalación.

## Roles
Administrador de la empresa de seguridad, coordinador de centro de control, supervisor de campo, guardia y cliente contratante (solo lectura de lo suyo).

## Mensaje comercial
"La plataforma que convierte cada operación de seguridad en cumplimiento verificable." Menos supervisión reactiva, más control operativo, mayor transparencia para el cliente.

## Hoja de ruta (no presentar como disponible sin confirmar)
- Primeros 3 meses (MVP): multiempresa, guardias, turnos, check-in, rondines QR, consignas, incidentes y dashboard.
- Meses 4 a 6: portal del cliente, SLA por contrato, alertas avanzadas, geocercas, reportes programados.
- Meses 7 a 12: planos interiores, integraciones (CCTV, sensores, ERP), analítica avanzada.

## Cuidado con estas afirmaciones
Precios, planes, porcentajes de mejora y plazos son hipótesis, no datos validados. La ubicación dentro de edificios no está garantizada con GPS. No se promete una prueba infalible contra suplantación de ubicación o de QR.$$
where name ilike 'bc%secure' and knowledge = '';
