/** Thrown by MailerService implementations when a transport fails to send. */
export class MailDeliveryException extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MailDeliveryException';
  }
}
