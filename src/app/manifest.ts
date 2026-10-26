import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'QR Menu', short_name: 'QR Menu', start_url: '/', display: 'standalone', background_color: '#fafaf9', theme_color: '#ea580c',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
