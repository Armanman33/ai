import { CONFIG } from '../config.js';
import { getDb, nowIso } from '../db/database.js';
import { generateId } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { maskPhoneForSelf } from '../utils/persian.js';

export interface SmsSendResult {
  sent: boolean;
  provider: string;
  sandboxCode?: string;
}

export interface SmsProvider {
  name: string;
  send(phone: string, message: string): Promise<{ ok: boolean; error?: string }>;
}

class SandboxSmsProvider implements SmsProvider {
  name = 'sandbox';
  async send(_phone: string, _message: string): Promise<{ ok: boolean }> {
    // In sandbox/development mode, SMS delivery is simulated and logged (with OTP redacted).
    return { ok: true };
  }
}

class KavenegarSmsProvider implements SmsProvider {
  name = 'kavenegar';
  async send(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
    if (!CONFIG.KAVENEGAR_API_KEY) {
      return { ok: false, error: 'KAVENEGAR_API_KEY is not configured' };
    }
    try {
      const url = `https://api.kavenegar.com/v1/${encodeURIComponent(CONFIG.KAVENEGAR_API_KEY)}/sms/send.json`;
      const body = new URLSearchParams({ receptor: phone, message });
      const res = await fetch(url, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'SMS network error' };
    }
  }
}

function getProvider(): SmsProvider {
  if (CONFIG.SMS_PROVIDER === 'kavenegar' && CONFIG.KAVENEGAR_API_KEY) {
    return new KavenegarSmsProvider();
  }
  return new SandboxSmsProvider();
}

async function dispatchSms(
  phone: string,
  eventType: string,
  message: string,
  redactedLogMessage?: string
): Promise<{ ok: boolean; provider: string }> {
  const provider = getProvider();
  if (CONFIG.IS_PRODUCTION && provider.name === 'sandbox' && !CONFIG.ALLOW_SANDBOX_SMS_IN_PROD) {
    logger.error('sms_blocked_sandbox_in_production', { eventType });
    return { ok: false, provider: 'unconfigured' };
  }

  const result = await provider.send(phone, message);
  if (!result.ok) {
    logger.warn('sms_dispatch_failed', {
      eventType,
      provider: provider.name,
      recipient: maskPhoneForSelf(phone),
      reason: result.error,
    });
  }

  const db = getDb();
  // Store privacy-safe message in sms_logs (NEVER store raw OTP codes in DB logs)
  db.prepare(`
    INSERT INTO sms_logs (id, recipient_phone, event_type, message, provider, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId(),
    maskPhoneForSelf(phone),
    eventType,
    redactedLogMessage || message,
    provider.name,
    result.ok ? 'sent' : 'failed',
    nowIso()
  );
  return { ok: result.ok, provider: provider.name };
}

export async function sendOtpSms(phone: string, code: string): Promise<SmsSendResult> {
  const message = `چی‌کجا | کد تأیید ورود شما: ${code}\nاین کد تا ۳ دقیقه معتبر است.`;
  const redactedMessage = 'چی‌کجا | کد تأیید ورود ۵ رقمی ارسال شد [محرمانه]';
  const res = await dispatchSms(phone, 'auth_otp', message, redactedMessage);
  const exposeSandboxCode =
    res.provider === 'sandbox' && (!CONFIG.IS_PRODUCTION || CONFIG.ALLOW_SANDBOX_SMS_IN_PROD);
  return {
    sent: res.ok,
    provider: res.provider,
    sandboxCode: exposeSandboxCode ? code : undefined,
  };
}

export async function sendFinderClaimAlertSms(phone: string, itemTitle: string): Promise<SmsSendResult> {
  const message = `چی‌کجا | یک درخواست بررسی مالکیت برای آگهی «${itemTitle}» ثبت شد. لطفاً وارد سامانه چی‌کجا شوید.`;
  const res = await dispatchSms(phone, 'finder_claim_received', message);
  return {
    sent: res.ok,
    provider: res.provider,
  };
}
