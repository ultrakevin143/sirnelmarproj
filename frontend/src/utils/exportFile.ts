import axios from 'axios';
import { Capacitor } from '@capacitor/core';

export async function exportFile(route: string, filename: string, mimeType: string) {
  const response = await axios.get<string>(route, { responseType: 'text' });
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const file = await Filesystem.writeFile({
      path: `exports/${filename}`,
      data: response.data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    try {
      await Share.share({
        title: 'LiftUp export',
        files: [file.uri],
        dialogTitle: 'Save or share export',
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Share canceled') throw error;
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([response.data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function authenticatedImageUrl(url: string): Promise<string> {
  if (!Capacitor.isNativePlatform() || !url.startsWith('/api/')) return url;
  try {
    const response = await axios.get<Blob>(url, { responseType: 'blob' });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Could not read the movement image.'));
      reader.onerror = () => reject(new Error('Could not read the movement image.'));
      reader.readAsDataURL(response.data);
    });
  } catch {
    return '';
  }
}
