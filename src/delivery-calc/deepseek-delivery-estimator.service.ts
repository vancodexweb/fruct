import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryEstimate,
  DeliveryEstimateParams,
  DeliveryEstimator,
} from './delivery-estimator.interface';

interface DeepSeekChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Calls DeepSeek's OpenAI-compatible chat completions endpoint, asking it to
 * estimate inter-city courier cost/ETA and requesting strict JSON back.
 *
 * TODO(prod): set DEEPSEEK_API_KEY (and DEEPSEEK_BASE_URL if not using the
 * default DeepSeek endpoint) in the environment. Without it, `estimate()`
 * throws rather than inventing a number — DeliveryCalcService treats that
 * as "this warehouse's cross-city quote is unavailable right now" for that
 * one variant instead of failing the whole request (see its doc comment).
 */
@Injectable()
export class DeepSeekDeliveryEstimator implements DeliveryEstimator {
  private readonly logger = new Logger(DeepSeekDeliveryEstimator.name);

  constructor(private readonly config: ConfigService) {}

  async estimate(params: DeliveryEstimateParams): Promise<DeliveryEstimate> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'DeepSeek не сконфигурирован (переменная окружения DEEPSEEK_API_KEY не задана) — ' +
          'автоматическая оценка стоимости межгородской доставки недоступна.',
      );
    }

    const baseUrl = (
      this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com'
    ).replace(/\/+$/, '');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content:
                'Ты — логистический калькулятор транспортной компании в России. Отвечай ТОЛЬКО валидным JSON без markdown-разметки и пояснений.',
            },
            { role: 'user', content: this.buildPrompt(params) },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Не удалось связаться с DeepSeek API: ${reason}`);
      throw new ServiceUnavailableException(`Не удалось связаться с DeepSeek API: ${reason}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`DeepSeek API вернул ${response.status}: ${body.slice(0, 500)}`);
      throw new ServiceUnavailableException(`DeepSeek API вернул ошибку ${response.status}.`);
    }

    const payload = (await response.json()) as DeepSeekChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException('DeepSeek вернул пустой ответ.');
    }

    return this.parseEstimate(content);
  }

  private buildPrompt(params: DeliveryEstimateParams): string {
    return (
      `Оцени стоимость (в рублях) и срок (в днях) доставки транспортной компанией по России. ` +
      `Откуда: ${params.fromCity}. Куда: ${params.toCity}. Вес груза: ${params.weightKg} кг. ` +
      `Ответь строго в формате JSON: {"costRub": число, "etaDaysMin": целое число, "etaDaysMax": целое число}.`
    );
  }

  private parseEstimate(content: string): DeliveryEstimate {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException('DeepSeek вернул невалидный JSON.');
    }

    if (!this.isEstimateShape(parsed)) {
      throw new ServiceUnavailableException('DeepSeek вернул JSON неожиданной структуры.');
    }

    if (parsed.costRub <= 0 || parsed.etaDaysMin < 0 || parsed.etaDaysMax < parsed.etaDaysMin) {
      throw new ServiceUnavailableException(
        'DeepSeek вернул некорректные значения оценки доставки.',
      );
    }

    return {
      costRub: parsed.costRub,
      etaDaysMin: Math.round(parsed.etaDaysMin),
      etaDaysMax: Math.round(parsed.etaDaysMax),
      raw: parsed,
    };
  }

  private isEstimateShape(
    value: unknown,
  ): value is { costRub: number; etaDaysMin: number; etaDaysMax: number } {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return (
      typeof record.costRub === 'number' &&
      typeof record.etaDaysMin === 'number' &&
      typeof record.etaDaysMax === 'number'
    );
  }
}
