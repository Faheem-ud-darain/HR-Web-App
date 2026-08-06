import { pb } from './pocketbase';

export interface AppRelease {
  id: string;
  version: string;
  apk_file: string;
  is_mandatory: boolean;
  release_notes: string;
  created: string;
}

export const appReleaseActions = {
  getLatestRelease: async (): Promise<AppRelease | null> => {
    try {
      const records = await pb.collection('hr_app_releases').getList<AppRelease>(1, 1, {
        sort: '-created',
      });
      return records.items.length > 0 ? records.items[0] : null;
    } catch (e) {
      console.error('Failed to get latest app release:', e);
      return null;
    }
  },

  getAllReleases: async (): Promise<AppRelease[]> => {
    try {
      const records = await pb.collection('hr_app_releases').getFullList<AppRelease>({
        sort: '-created',
      });
      return records;
    } catch (e) {
      console.error('Failed to get all app releases:', e);
      return [];
    }
  },

  deleteRelease: async (id: string): Promise<boolean> => {
    try {
      await pb.collection('hr_app_releases').delete(id);
      return true;
    } catch (e) {
      console.error('Failed to delete release:', e);
      return false;
    }
  },
  
  createRelease: async (version: string, apkFile: File, isMandatory: boolean, releaseNotes: string): Promise<AppRelease> => {
    const formData = new FormData();
    formData.append('version', version);
    const forcedApkFile = new File([apkFile], apkFile.name || 'app.apk', { type: 'application/vnd.android.package-archive' });
    formData.append('apk_file', forcedApkFile);
    formData.append('is_mandatory', String(isMandatory));
    formData.append('release_notes', releaseNotes);
    
    return await pb.collection('hr_app_releases').create<AppRelease>(formData);
  },

  getApkUrl: (release: AppRelease): string => {
    const originalUrl = pb.getFileUrl(release, release.apk_file);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' && window.location.origin.startsWith('http') && !window.location.origin.includes('localhost') ? window.location.origin : 'https://delcargo-io.vercel.app');
    // Base64 encode to hide any .zip extensions in the original URL from Android's aggressive Download Manager
    const encodedUrl = typeof window !== 'undefined' ? btoa(originalUrl) : Buffer.from(originalUrl).toString('base64');
    return `${siteUrl}/api/download/app.apk?url=${encodeURIComponent(encodedUrl)}`;
  }
};
