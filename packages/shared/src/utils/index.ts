/**
 * Format phone number to E.164 format
 * Example: (11) 99999-9999 -> +5511999999999
 */
export function formatPhoneE164(phone: string, countryCode: string = '55'): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If already has country code, return with +
  if (digits.startsWith(countryCode)) {
    return `+${digits}`;
  }

  // Add country code
  return `+${countryCode}${digits}`;
}

/**
 * Calculate realistic typing time based on message length
 * Formula: max(1200ms, length * 40ms), capped between 1.2s and 6s
 */
export function calculateTypingTime(text: string): number {
  const baseTime = 1200; // 1.2 seconds minimum
  const timePerChar = 40; // 40ms per character
  const maxTime = 6000; // 6 seconds maximum

  const calculated = Math.max(baseTime, text.length * timePerChar);
  return Math.min(calculated, maxTime);
}

/**
 * Calculate realistic recording time for audio message
 * Based on estimated speaking duration
 */
export function calculateRecordingTime(text: string): number {
  const wordsPerMinute = 150; // Average Portuguese speaking speed
  const words = text.split(/\s+/).length;
  const durationSeconds = (words / wordsPerMinute) * 60;

  // Add 2 seconds for processing
  return Math.round((durationSeconds + 2) * 1000);
}

/**
 * Check if message looks like user is still typing
 * (multiple short messages without punctuation)
 */
export function looksLikeTyping(message: string): boolean {
  // Short messages without sentence-ending punctuation
  const hasEndPunctuation = /[.!?]$/.test(message.trim());
  const isShort = message.length < 50;

  return isShort && !hasEndPunctuation;
}

/**
 * Sanitize emoji reactions for WhatsApp
 * - Remove emojis inside numbers/codes
 * - Limit to maximum 2 per message
 */
export function sanitizeEmojis(emojis: string[], text: string): string[] {
  // Don't react if message contains numbers/codes
  if (/\d{3,}/.test(text)) {
    return [];
  }

  // Limit to 2 emojis
  return emojis.slice(0, 2);
}

/**
 * Parse duration string to milliseconds
 * Example: "2.5s" -> 2500, "1m" -> 60000
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const [, value, unit] = match;
  const num = parseFloat(value);

  switch (unit) {
    case 'ms': return num;
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    default: throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a logger with structured output
 */
export function createLogger(namespace: string) {
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      console.log(JSON.stringify({
        level: 'info',
        namespace,
        message,
        ...meta,
        timestamp: new Date().toISOString()
      }));
    },
    error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
      console.error(JSON.stringify({
        level: 'error',
        namespace,
        message,
        error: error ? { message: error.message, stack: error.stack } : undefined,
        ...meta,
        timestamp: new Date().toISOString()
      }));
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(JSON.stringify({
        level: 'warn',
        namespace,
        message,
        ...meta,
        timestamp: new Date().toISOString()
      }));
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(JSON.stringify({
          level: 'debug',
          namespace,
          message,
          ...meta,
          timestamp: new Date().toISOString()
        }));
      }
    },
  };
}
