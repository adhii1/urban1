'use client';

import { useParams } from 'next/navigation';
import { CustomerRideDetailsPage } from '@/components/customer/CustomerPortalScreens';

export default function Page() {
  const params = useParams<{ rideId: string }>();
  return <CustomerRideDetailsPage rideId={params.rideId} />;
}
