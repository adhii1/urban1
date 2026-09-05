'use client';

import { useEffect, useRef, useState } from 'react';
import { QrCode, CheckCircle2, XCircle, Camera, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api/client';

type ScanResult = {
  ok: boolean;
  message: string;
  passenger?: { name: string; status: string; pickup?: string; drop?: string };
  boardedCount?: number;
  totalCount?: number;
};

export default function DriverScanPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const busyRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [camError, setCamError] = useState('');

  const submitToken = async (token: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await api.post<any>('/driver/board/scan', { token });
      const d = res.data;
      setResult({
        ok: true,
        message: res.message || 'Passenger boarded',
        passenger: d?.passenger,
        boardedCount: d?.trip?.boardedCount,
        totalCount: d?.trip?.totalCount,
      });
    } catch (err: any) {
      setResult({ ok: false, message: err?.message || 'Scan failed' });
    } finally {
      // Brief cooldown so one QR isn't submitted repeatedly.
      setTimeout(() => { busyRef.current = false; }, 1500);
    }
  };

  const startScanner = async () => {
    setResult(null);
    setCamError('');
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const el = containerRef.current;
      if (!el) return;
      el.id = el.id || 'qr-reader-region';
      const scanner = new Html5Qrcode(el.id);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText: string) => { submitToken(decodedText); },
        () => { /* per-frame decode failure — ignore */ }
      );
    } catch (err: any) {
      setCamError(err?.message || 'Could not access camera. Allow camera permission and use HTTPS.');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    const s = scannerRef.current;
    if (s) {
      try { await s.stop(); await s.clear(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => () => { stopScanner(); }, []);

  return (
    <div style={{ maxWidth: '440px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>Scan to Board</h2>
      <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '18px' }}>Scan a passenger's boarding QR to check them into your shuttle.</p>

      {/* Camera region */}
      <div
        ref={containerRef}
        id="qr-reader-region"
        style={{ width: '100%', minHeight: scanning ? '300px' : '0', borderRadius: '16px', overflow: 'hidden', background: '#0B1220', border: scanning ? '1px solid rgba(255,255,255,0.1)' : 'none', marginBottom: scanning ? '16px' : '0' }}
      />

      {!scanning && !result && (
        <button onClick={startScanner} style={{ width: '100%', padding: '16px', background: '#16C15D', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 700, fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Camera size={18} /> Open Camera & Scan
        </button>
      )}

      {scanning && (
        <button onClick={stopScanner} style={{ width: '100%', padding: '12px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
          Stop Scanning
        </button>
      )}

      {camError && (
        <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '10px', color: '#FCA5A5', fontSize: '12px' }}>{camError}</div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: '16px', padding: '20px', borderRadius: '16px', background: result.ok ? 'rgba(22,193,93,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${result.ok ? 'rgba(22,193,93,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: result.passenger ? '12px' : '0' }}>
            {result.ok ? <CheckCircle2 size={24} color="#16C15D" /> : <XCircle size={24} color="#EF4444" />}
            <span style={{ fontSize: '15px', fontWeight: 700, color: result.ok ? '#16C15D' : '#EF4444' }}>{result.message}</span>
          </div>
          {result.passenger && (
            <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#FFF' }}>{result.passenger.name}</p>
              {result.passenger.pickup && <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Pickup: {result.passenger.pickup}</p>}
              {typeof result.boardedCount === 'number' && (
                <p style={{ fontSize: '12px', color: '#16C15D', marginTop: '6px', fontWeight: 600 }}>{result.boardedCount} / {result.totalCount} passengers boarded</p>
              )}
            </div>
          )}
          <button onClick={() => { setResult(null); startScanner(); }} style={{ marginTop: '14px', width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', color: '#FFF', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <RotateCcw size={14} /> Scan Next
          </button>
        </div>
      )}
    </div>
  );
}
