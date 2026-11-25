/** Deployment can inject these through a ConfigMap and a Secret. Empty values keep the integration unconfigured. */
export function calendarMailConfig(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.CALENDAR_MAIL_API_URL?.trim().replace(/\/+$/, '') || undefined;
  return {
    endpoint: baseUrl ? `${baseUrl}/Mail/send/calender` : undefined,
    apiKey: env.CALENDAR_MAIL_API_KEY || undefined,
    from: env.CALENDAR_MAIL_FROM?.trim() || undefined,
  };
}
