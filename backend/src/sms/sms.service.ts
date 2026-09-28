import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SendResult {
  status: SmsStatus;
  providerRef?: string;
  error?: string;
}

/**
 * Outgoing SMS.
 *
 * Two rules shape everything here.
 *
 * A message is recorded before it is attempted, so a failure is visible
 * rather than silent — a cashier who has been told the customer was texted
 * will not check.
 *
 * And sending never fails a sale. The money is taken, the stock is gone and
 * the receipt is printed; a gateway timing out afterwards is a message
 * problem, not a trading one. Every path here swallows its errors into the
 * record and returns.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get provider(): string {
    return (this.config.get<string>('SMS_PROVIDER') ?? '').trim().toLowerCase();
  }

  private get apiKey(): string {
    return (this.config.get<string>('ARKESEL_API_KEY') ?? '').trim();
  }

  private get senderId(): string {
    // Arkesel caps the sender at 11 characters and rejects longer ones.
    return (this.config.get<string>('SMS_SENDER_ID') ?? 'LormaBeauty').trim().slice(0, 11);
  }

  /** True when a provider is configured well enough to actually send. */
  get configured(): boolean {
    return this.provider === 'arkesel' && this.apiKey.length > 0;
  }

  /**
   * Record a message and try to send it.
   *
   * Returns the record id rather than throwing, because every caller is on
   * a path where the important work has already succeeded.
   */
  async send(params: { to: string; body: string; saleId?: string }): Promise<string | null> {
    let recordId: string | null = null;

    try {
      const record = await this.prisma.smsMessage.create({
        data: {
          toPhone: params.to,
          body: params.body,
          saleId: params.saleId ?? null,
          status: SmsStatus.QUEUED,
          provider: this.configured ? this.provider : null,
        },
      });
      recordId = record.id;
    } catch (error) {
      // Even the record failed. Nothing else here can work, and the sale
      // must not be disturbed by it.
      this.logger.error(`Could not record an SMS to ${params.to}: ${String(error)}`);
      return null;
    }

    if (!this.configured) {
      // Left QUEUED on purpose: it is a real message waiting for a provider,
      // not a failure, and it can be sent once one is configured.
      this.logger.warn(
        `SMS to ${params.to} recorded but not sent: no SMS provider is configured (set SMS_PROVIDER and ARKESEL_API_KEY).`,
      );
      return recordId;
    }

    const result = await this.deliver(params.to, params.body);

    try {
      await this.prisma.smsMessage.update({
        where: { id: recordId },
        data: {
          status: result.status,
          providerRef: result.providerRef ?? null,
          error: result.error ?? null,
          attempts: { increment: 1 },
          sentAt: result.status === SmsStatus.SENT ? new Date() : null,
        },
      });
    } catch (error) {
      this.logger.error(`Could not update SMS ${recordId}: ${String(error)}`);
    }

    return recordId;
  }

  /**
   * Hand one message to Arkesel.
   *
   * https://developers.arkesel.com — v2 takes a JSON body and an api-key
   * header, and answers 200 with a status field that must be read: a 200
   * with status "error" is still a failure.
   */
  private async deliver(to: string, body: string): Promise<SendResult> {
    const controller = new AbortController();
    // A till cannot wait on a gateway. The record keeps the message either way.
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
        body: JSON.stringify({ sender: this.senderId, message: body, recipients: [to] }),
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        return { status: SmsStatus.FAILED, error: `HTTP ${response.status}: ${text.slice(0, 500)}` };
      }

      let payload: { status?: string; data?: Array<{ id?: string }>; message?: string } = {};
      try {
        payload = JSON.parse(text) as typeof payload;
      } catch {
        return { status: SmsStatus.FAILED, error: `Unreadable response: ${text.slice(0, 500)}` };
      }

      if ((payload.status ?? '').toLowerCase() !== 'success') {
        return {
          status: SmsStatus.FAILED,
          error: payload.message ?? `Provider refused it: ${text.slice(0, 500)}`,
        };
      }

      return { status: SmsStatus.SENT, providerRef: payload.data?.[0]?.id };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        status: SmsStatus.FAILED,
        error: aborted ? 'The SMS gateway did not answer within 10 seconds.' : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * The receipt message.
 *
 * A sale can hold many products and the template names one, so a basket of
 * several is described by its first line and a count — naming only the
 * first would be misleading about what was bought.
 */
export function receiptSms(params: {
  itemNames: string[];
  amount: string;
  receiptNumber: string;
}): string {
  const [first, ...rest] = params.itemNames;
  const products =
    rest.length === 0
      ? (first ?? 'your items')
      : `${first} and ${rest.length} more item${rest.length === 1 ? '' : 's'}`;

  return (
    `Lorma Beauty: Thank you for your purchase! Your order of ${products} ` +
    `for GHS ${params.amount} was successful. Ref: ${params.receiptNumber}. ` +
    `Thank you for choosing Lorma Beauty! 💕`
  );
}
