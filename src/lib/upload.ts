import { supabaseBrowser } from './supabase/client';
export async function uploadImage(restaurantId: string, file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const sb = supabaseBrowser();
  const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}
