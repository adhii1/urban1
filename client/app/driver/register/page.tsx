import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function Page() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5"><Card className="w-full max-w-md border-white/10 bg-slate-900 text-white"><CardHeader><Link href="/driver/login" className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-400"><ArrowLeft className="size-3.5" /> Back to sign in</Link><CardTitle className="flex items-center gap-2"><UserPlus className="size-5 text-emerald-400" /> Driver registration</CardTitle><CardDescription className="text-slate-400">Start your application for the TORQQ driver network.</CardDescription></CardHeader><CardContent><form className="space-y-3"><Input placeholder="Full name" className="border-white/10 bg-slate-950 text-white placeholder:text-slate-500" /><Input type="tel" placeholder="10-digit phone number" className="border-white/10 bg-slate-950 text-white placeholder:text-slate-500" /><Input placeholder="Vehicle registration number" className="border-white/10 bg-slate-950 text-white placeholder:text-slate-500" /><Button className="mt-2 w-full">Submit application</Button></form></CardContent></Card></main>;
}
