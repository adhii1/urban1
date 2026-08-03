import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import ToastContainer from '../components/ToastContainer';
import QueryProvider from '../components/QueryProvider';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'TORQQ Admin Portal',
  description: 'Fleet Management Console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className={poppins.variable}>
        <QueryProvider>
          {children}
        </QueryProvider>
        <ToastContainer />
      </body>
    </html>
  );
}
