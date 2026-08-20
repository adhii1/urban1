import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import './css/style.css';
import './css/modal.css';
import './css/dashboard.css';
import './css/tracking.css';
import './css/wallet.css';
import './css/settings.css';
import './css/digital-pass.css';
import './css/driver.css';
import { QueryProvider } from '@/lib/api/QueryProvider';
import ToastContainer from '@/components/shared/ToastContainer';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'TORQQ - Smart Commute. Better Everyday.',
  description: 'Affordable, reliable and safe office commute with fixed routes, timings and monthly passes in Bangalore.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={poppins.variable}>
        <QueryProvider>
          {children}
          <ToastContainer />
        </QueryProvider>
      </body>
    </html>
  );
}
