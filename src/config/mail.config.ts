import { registerAs } from '@nestjs/config';

export interface MailConfig {
  /** `smtp` binds a real transport; `log` keeps the dev console transport. */
  mailer: 'smtp' | 'log';
  host: string;
  port: number;
  username: string;
  password: string;
  /**
   * `ssl` opens the connection already wrapped in TLS (implicit, port 465).
   * `tls` connects in the clear and upgrades via STARTTLS (port 587) — which
   * is what Gmail expects. Either way the credentials never cross the wire
   * unencrypted; `null` would send them in plaintext (OWASP A02).
   */
  encryption: 'tls' | 'ssl' | null;
  fromAddress: string;
  fromName: string;
}

/**
 * Kept in its own file alongside `jwt.config.ts` because it holds a
 * credential — one place to audit, and nothing else needs to read it.
 */
export default registerAs('mail', (): MailConfig => {
  const encryption = (process.env.MAIL_ENCRYPTION ?? '').toLowerCase();

  return {
    mailer: process.env.MAIL_MAILER === 'smtp' ? 'smtp' : 'log',
    host: process.env.MAIL_HOST ?? '',
    port: Number(process.env.MAIL_PORT ?? 587),
    username: process.env.MAIL_USERNAME ?? '',
    password: process.env.MAIL_PASSWORD ?? '',
    encryption:
      encryption === 'ssl' || encryption === 'tls' ? encryption : null,
    fromAddress: process.env.MAIL_FROM_ADDRESS ?? '',
    fromName: process.env.MAIL_FROM_NAME ?? '',
  };
});
