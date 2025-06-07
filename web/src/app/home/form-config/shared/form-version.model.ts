export interface FormVersion {
  _id?: string;
  type: 'sitePermit' | 'toolboxMeeting' | 'safetyChecklist';
  version: string;
  name: string;
  logo: string; // image base64
  header: string;
  remarks?: string; // 備註
  createdAt: Date;
}

export interface SiteFormConfig {
  _id?: string;
  siteId: string;
  siteName: string;
  sitePermitVersionId: string;
  toolboxMeetingVersionId: string;
  safetyChecklistVersionId: string;
  updatedAt: Date;
} 