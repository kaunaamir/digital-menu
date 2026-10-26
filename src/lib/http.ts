import { NextResponse } from 'next/server';
export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
export const noStore = { 'Cache-Control': 'no-store' };
export const fail = (status: number, message: string, code = 'ERROR') => NextResponse.json({ error: message, code }, { status, headers: noStore });
