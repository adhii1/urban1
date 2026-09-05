'use client';

import { useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { QrCode, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { api } from '@/lib/api/client';

interface BoardingData {
  token: string;
  trip: { tripId: string; serviceDate: string; pickupTime: string; status: string; boardingStatus: string; boarded: boolean };
  customerName: string;
}

export default function BoardingPassPage() {
  const [data, setData] = useState<BoardingData | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<BoardingData>('/booking/boarding-qr');
      setData(res.data);
      // Render the signed token string as a QR image (data URL).
      const url = await QRCode.toDataURL(res.data.token, { width: 280, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } });
      setQrUrl(url);
    } catch (err: any) {
      setError(err?.message || 'No upcoming trip to board.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: '440px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>Boarding Pass</h2>
      <p style={{ fontSize: '13px', color: '#475569', marginBottom: '20px' }}>Show this QR to your driver to board the shuttle.</p>

      {loading ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>Loading your boarding pass…</div>
      ) : error ? (
        <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
          <Clock size={32} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '14px', color: '#0F172A', fontWeight: 600 }}>{error}</p>
          <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>Your boarding QR appears here once you have an upcoming shuttle trip.</p>
          <button onClick={load} style={{ marginTop: '16px', padding: '10px 18px', background: '#16C15D', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : data && (
        <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
          {data.trip.boarded ? (
            <div style={{ padding: '16px', background: '#F0FDF4', borderRadius: '12px', marginBottom: '16px' }}>
              <CheckCircle2 size={28} color="#16A34A" style={{ margin: '0 auto 6px' }} />
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#16A34A' }}>You're on board!</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', background: '#EFF6FF', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: '#2563EB', marginBottom: '16px' }}>
                <QrCode size={13} /> SCAN TO BOARD
              </div>
              <div style={{ background: '#fff', borderRadius: '16px', padding: '12px', display: 'inline-block', border: '1px solid #E2E8F0' }}>
                {qrUrl && <img src={qrUrl} alt="Boarding QR code" style={{ display: 'block', width: '240px', height: '240px' }} />}
              </div>
            </>
          )}

          <div style={{ marginTop: '18px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Passenger</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{data.customerName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Date</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{new Date(data.trip.serviceDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Pickup Time</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{data.trip.pickupTime || '08:00'}</span>
            </div>
          </div>

          <button onClick={load} style={{ marginTop: '16px', width: '100%', padding: '12px', background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Refresh QR
          </button>
        </div>
      )}
    </div>
  );
}
