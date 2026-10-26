import OrderTracker from '@/components/OrderTracker';
export const metadata = { title: 'Track your order', robots: { index: false } };
export default function OrderPage({ params, searchParams }: { params: { token: string }; searchParams: { pay?: string } }) {
  return <OrderTracker token={params.token} autoPay={searchParams.pay === '1'} />;
}
