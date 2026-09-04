import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { MailTemplate, MailTemplateContextMap, RenderedMail } from './mailer.types';

const TEMPLATES_DIR = path.join(__dirname, 'templates');

type CompiledTemplate = ReturnType<typeof Handlebars.compile>;

const compiledTemplateCache = new Map<MailTemplate, CompiledTemplate>();

function getCompiledTemplate(template: MailTemplate): CompiledTemplate {
  const cached = compiledTemplateCache.get(template);
  if (cached) {
    return cached;
  }

  const filePath = path.join(TEMPLATES_DIR, `${template}.hbs`);
  const source = fs.readFileSync(filePath, 'utf-8');
  const compiled = Handlebars.compile(source);
  compiledTemplateCache.set(template, compiled);
  return compiled;
}

function wrapInEmailShell(innerHtml: string): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:24px;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
      <tr>
        <td style="background-color:#ffffff;border-radius:8px;padding:32px;">
          ${innerHtml}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Renders a template into a ready-to-send email. Templates are cached after first compile. */
export function renderMailTemplate<T extends MailTemplate>(
  template: T,
  subject: string,
  to: string,
  context: MailTemplateContextMap[T],
): RenderedMail {
  const compiled = getCompiledTemplate(template);
  const innerHtml = compiled(context);
  const html = wrapInEmailShell(innerHtml);
  return { to, subject, html, text: htmlToPlainText(innerHtml) };
}
