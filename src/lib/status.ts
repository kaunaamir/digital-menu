// Order workflow rules. MUST stay in sync with public.update_order_status() in 0003_functions.sql.
export const WORKFLOW = ['new', 'accepted', 'preparing', 'ready', 'served', 'completed'] as const;
export type FlowStatus = (typeof WORKFLOW)[number];
export type OrderStatus = FlowStatus | 'rejected' | 'cancelled';
export type WorkflowEnd = 'ready' | 'served' | 'completed';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', served: 'Served',
  completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
};
export const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: 'Accept', preparing: 'Start preparing', ready: 'Mark ready', served: 'Mark served', completed: 'Complete',
};

const endIndex = (end: WorkflowEnd) => WORKFLOW.indexOf(end);

export function nextStatus(cur: OrderStatus, end: WorkflowEnd): FlowStatus | null {
  const i = WORKFLOW.indexOf(cur as FlowStatus);
  if (i < 0 || i >= endIndex(end)) return null;
  return WORKFLOW[i + 1];
}
export function isTerminal(cur: OrderStatus, end: WorkflowEnd): boolean {
  if (cur === 'rejected' || cur === 'cancelled') return true;
  const i = WORKFLOW.indexOf(cur as FlowStatus);
  return i >= endIndex(end);
}
export const canReject = (cur: OrderStatus) => cur === 'new';
export function canCancel(cur: OrderStatus, end: WorkflowEnd): boolean {
  const i = WORKFLOW.indexOf(cur as FlowStatus);
  return i >= 1 && i < endIndex(end);
}
export function canTransition(from: OrderStatus, to: OrderStatus, end: WorkflowEnd): boolean {
  if (to === 'rejected') return canReject(from);
  if (to === 'cancelled') return canCancel(from, end);
  return nextStatus(from, end) === to;
}
/** Steps shown on the customer progress bar. */
export const progressSteps = (end: WorkflowEnd): FlowStatus[] => WORKFLOW.slice(0, endIndex(end) + 1) as FlowStatus[];
