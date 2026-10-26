const MSG: Record<string, string> = {
  FORBIDDEN: 'You do not have permission to do that.', REASON_REQUIRED: 'A reason is required.', SLUG_TAKEN: 'That web address is already taken.',
  USER_NOT_FOUND: 'No account with that email. Ask them to sign up first.', INVALID_ROLE: 'Invalid role.',
  ONLINE_PAYMENT_VERIFIED_BY_GATEWAY_ONLY: 'Online payments are confirmed automatically by the payment gateway.',
};
export function rpcMessage(message: string | undefined): string {
  if (!message) return 'Something went wrong.';
  const [code, detail] = message.split('|');
  if (code === 'INVALID_TRANSITION') return `That status change is not allowed (${detail}). The order may have been updated by someone else.`;
  return MSG[code] ?? message;
}
