export interface Plan {
  _id: string;
  name: string;
  serviceType: 'Home-to-Office' | 'Stop-to-Stop';
  tier: 'Flexy' | 'Hybrid' | 'Weekday' | 'Standard';
  description: string;
  durationDays: number;
  price: number;
  pauseDaysAllowed: number;
  features: string[];
  isActive: boolean;
}

export interface Route {
  _id: string;
  name: string;
  startLocation: string;
  endLocation: string;
}

export interface Customer {
  _id: string;
  name: string;
  phone?: string;
}

export interface Subscription {
  _id: string;
  customerId: Customer | string;
  planId: Plan | string;
  routeId: Route | string;
  startDate: string;
  endDate: string;
  remainingPauseDays: number;
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';
}
