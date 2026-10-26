import { describe, it, expect } from 'vitest';
import { nextStatus, canTransition, isTerminal, canCancel, progressSteps } from '@/lib/status';

describe('order workflow', () => {
  it('walks new -> completed by default', () => {
    expect(nextStatus('new', 'completed')).toBe('accepted');
    expect(nextStatus('ready', 'completed')).toBe('served');
    expect(nextStatus('served', 'completed')).toBe('completed');
    expect(nextStatus('completed', 'completed')).toBeNull();
  });
  it('respects the configured end of the workflow', () => {
    expect(nextStatus('ready', 'ready')).toBeNull();
    expect(isTerminal('ready', 'ready')).toBe(true);
    expect(nextStatus('ready', 'served')).toBe('served');
    expect(nextStatus('served', 'served')).toBeNull();
    expect(progressSteps('ready')).toEqual(['new', 'accepted', 'preparing', 'ready']);
  });
  it('blocks skipping and going backwards', () => {
    expect(canTransition('new', 'preparing', 'completed')).toBe(false);
    expect(canTransition('preparing', 'accepted', 'completed')).toBe(false);
    expect(canTransition('completed', 'new', 'completed')).toBe(false);
  });
  it('rejects only new orders; cancels only in-progress ones', () => {
    expect(canTransition('new', 'rejected', 'completed')).toBe(true);
    expect(canTransition('accepted', 'rejected', 'completed')).toBe(false);
    expect(canCancel('new', 'completed')).toBe(false);
    expect(canCancel('preparing', 'completed')).toBe(true);
    expect(canCancel('ready', 'ready')).toBe(false);
    expect(isTerminal('rejected', 'completed')).toBe(true);
  });
});
