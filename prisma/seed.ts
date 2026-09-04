/**
 * Idempotent bootstrap: creates the Tenant + the first OWNER user the very
 * first time this runs against an empty database, and does nothing on every
 * subsequent run (so `docker compose up` can safely re-run it on restart).
 *
 * There is no HTTP registration endpoint anywhere in this project — this
 * script is the only way the first account ever gets created. Everyone
 * after that is created by an OWNER through POST /users.
 *
 * Runs standalone via `ts-node`/`prisma db seed`, outside of Nest's DI
 * container — hence the direct `new PrismaClient()` and the direct reuse of
 * the mailer module's plain (non-injectable) building blocks instead of
 * going through MailerModule/MailQueueService.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/security/password.util';
import { generateSecureToken } from '../src/common/security/generate-secure-token';
import { getSmtpConfigFromEnv } from '../src/mailer/smtp-config';
import { createNodemailerTransport } from '../src/mailer/nodemailer-transport.factory';
import { renderMailTemplate } from '../src/mailer/mail-template.renderer';
import { MailTemplate } from '../src/mailer/mailer.types';

const prisma = new PrismaClient();

async function sendBootstrapCredentialsEmail(params: {
  to: string;
  fullName: string;
  temporaryPassword: string;
}): Promise<void> {
  const rendered = renderMailTemplate(
    MailTemplate.CREDENTIALS_ISSUED,
    'Доступ к CRM: учётная запись владельца создана',
    params.to,
    {
      fullName: params.fullName,
      email: params.to,
      temporaryPassword: params.temporaryPassword,
      roleLabel: 'владельца',
    },
  );

  const smtp = getSmtpConfigFromEnv();
  const transport = createNodemailerTransport(smtp);
  await transport.sendMail({
    from: smtp.from,
    to: rendered.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

async function main(): Promise<void> {
  const existingTenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (existingTenant) {
    console.log('[seed] Tenant уже существует — пропускаем бутстрап (идемпотентный запуск).');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Error(
      '[seed] Переменная окружения ADMIN_EMAIL обязательна для первого запуска: ' +
        'на этот адрес будет создана учётная запись владельца и (при необходимости) отправлен временный пароль.',
    );
  }

  const tenantName = process.env.TENANT_NAME || 'Магазин компьютерных кресел';
  const adminFullName = process.env.ADMIN_FULL_NAME || 'Иванов Иван Иванович';

  const passwordFromEnv = process.env.ADMIN_INITIAL_PASSWORD;
  const password = passwordFromEnv || generateSecureToken(24);
  const wasPasswordGenerated = !passwordFromEnv;

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: tenantName } });
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        passwordHash,
        fullName: adminFullName,
        role: 'OWNER',
        mustChangePassword: true,
      },
    });
  });

  console.log(`[seed] Тенант "${tenantName}" и владелец ${adminEmail} созданы.`);

  if (wasPasswordGenerated) {
    // Never log the generated password — it only ever leaves this process
    // inside the email body sent below.
    try {
      await sendBootstrapCredentialsEmail({
        to: adminEmail,
        fullName: adminFullName,
        temporaryPassword: password,
      });
      console.log(`[seed] Временный пароль сгенерирован и отправлен на ${adminEmail}.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // The account was already created — we can't silently swallow a failed
      // delivery of the only copy of its password, but we also must not log
      // the password itself. Fail loudly so the operator notices and can
      // reset it via ADMIN_INITIAL_PASSWORD + a manual password reset.
      throw new Error(
        `[seed] Владелец создан, но письмо с временным паролем не удалось отправить на ${adminEmail} (${reason}). ` +
          'Пароль НЕ был выведен в лог. Сбросьте его вручную через процесс восстановления пароля ' +
          'после того как почта будет исправна, либо задайте ADMIN_INITIAL_PASSWORD и пересоздайте тенант.',
      );
    }
  } else {
    console.log('[seed] ADMIN_INITIAL_PASSWORD задан явно — письмо с паролем не отправлялось.');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
