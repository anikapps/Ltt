import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        // Prefer standard Wi-Fi / LAN private ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
          candidates.unshift(net.address);
        } else {
          candidates.push(net.address);
        }
      }
    }
  }

  const lanIp = candidates[0] || null;
  const port = process.env.PORT || '3000';
  const lanOrigin = lanIp ? `http://${lanIp}:${port}` : null;

  return NextResponse.json({
    lanIp,
    port,
    lanOrigin
  });
}
