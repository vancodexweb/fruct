export interface DeliveryEstimateParams {
  fromCity: string;
  toCity: string;
  weightKg: number;
}

export interface DeliveryEstimate {
  costRub: number;
  etaDaysMin: number;
  etaDaysMax: number;
  /** The provider's raw response, stored on DeliveryQuote.rawResponse for audit/debugging. */
  raw?: unknown;
}

/**
 * The one external API call in this whole module — kept behind an
 * interface so it can be mocked in tests and swapped without touching
 * DeliveryCalcService. See DeepSeekDeliveryEstimator for the real adapter.
 */
export interface DeliveryEstimator {
  estimate(params: DeliveryEstimateParams): Promise<DeliveryEstimate>;
}
