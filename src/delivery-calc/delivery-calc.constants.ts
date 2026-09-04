export const DELIVERY_ESTIMATOR = Symbol('DELIVERY_ESTIMATOR');

export const DELIVERY_CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Cache keys bucket weight to this granularity so nearby requests share a cached DeepSeek estimate. */
export const WEIGHT_BUCKET_SIZE_KG = 5;
