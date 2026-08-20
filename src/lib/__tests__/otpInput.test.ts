import { parseOtpInput } from '../otpInput';

/**
 * Whether someone can sign in at all comes down to this function reading
 * what their mail client handed them.
 */

describe('parseOtpInput', () => {
  it('reads a six-digit code', () => {
    expect(parseOtpInput('123456')).toEqual({ kind: 'code', token: '123456' });
  });

  it('reads a code that arrived with spaces or dashes in it', () => {
    expect(parseOtpInput(' 123 456 ')).toEqual({ kind: 'code', token: '123456' });
    expect(parseOtpInput('123-456')).toEqual({ kind: 'code', token: '123456' });
  });

  it('reads a pasted confirmation link', () => {
    const url =
      'https://uxilsnqyxdfslwdgsxnd.supabase.co/auth/v1/verify?token_hash=pkce_abc123-_&type=email&redirect_to=https://example.com';
    expect(parseOtpInput(url)).toEqual({ kind: 'link', tokenHash: 'pkce_abc123-_' });
  });

  it('reads a link a mail client wrapped in brackets', () => {
    const url = '<https://x.supabase.co/auth/v1/verify?token_hash=abc&type=email>';
    expect(parseOtpInput(url)).toEqual({ kind: 'link', tokenHash: 'abc' });
  });

  it('treats a six-digit token= as the code it is', () => {
    // Some templates use token= rather than token_hash=, and when the value
    // is six digits it is the OTP, not a hash.
    expect(parseOtpInput('https://x.co/verify?token=654321&type=email')).toEqual({
      kind: 'code',
      token: '654321',
    });
  });

  it('treats a long token= as a hash', () => {
    expect(parseOtpInput('https://x.co/verify?token=abcdefghij&type=email')).toEqual({
      kind: 'link',
      tokenHash: 'abcdefghij',
    });
  });

  it('refuses what is neither', () => {
    for (const bad of ['', '   ', '12345', '1234567', 'hello', 'https://example.com']) {
      expect(parseOtpInput(bad)).toBeNull();
    }
  });
});

describe('serverMessage', () => {
  const { serverMessage } = require('../serverError');

  it('turns a dropped connection into something actionable', () => {
    // What the simulator actually produced: a native TLS exception with a
    // Swift file name in it. Nobody can act on that.
    for (const raw of [
      'fetch failed: UnexpectedException: A TLS error caused the secure connection to fail. (at ExpoModulesCore/Promise.swift:56)',
      'Network request failed',
      'Aborted',
      'The request timed out',
    ]) {
      expect(serverMessage(new Error(raw))).toBe(
        'Could not reach the server. Check your connection and try again.'
      );
    }
  });

  it('leaves a real answer from the server alone', () => {
    // These are worth reading: they say what to change.
    expect(serverMessage(new Error('Email address "x@invalid" is invalid'))).toBe(
      'Email address "x@invalid" is invalid'
    );
    expect(serverMessage({ message: 'Token has expired or is invalid' })).toBe(
      'Token has expired or is invalid'
    );
  });

  it('says something rather than nothing for a shapeless failure', () => {
    expect(serverMessage(undefined)).toBe('Something went wrong.');
  });
});
