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
    return `/api/download-apk?url=${encodeURIComponent(originalUrl)}`;
  }
};
