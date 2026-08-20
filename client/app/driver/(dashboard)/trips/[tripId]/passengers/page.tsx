'use client';

import { useParams } from 'next/navigation';
import { DriverPassengersPage } from '@/components/driver/DriverPortalScreens';

export default function Page() {
  const params = useParams<{ tripId: string }>();
  return <DriverPassengersPage tripId={params.tripId} />;
}
