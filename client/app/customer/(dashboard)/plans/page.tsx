'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The standalone plans/Razorpay purchase flow has been unified into the single
 * coordinate-based Subscribe flow (which now offers wallet or online payment).
 * This route redirects to it.
 */
export default function PlansRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/customer/subscribe');
  }, [router]);
  return null;
}
