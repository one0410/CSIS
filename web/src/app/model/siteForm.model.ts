export interface SiteForm {
    _id?: string;
    siteId: string;
    formType: 'sitePermit' | 'toolboxMeeting' | 'safetyChecklist' | 'specialWorkChecklist' | 'defectRecord' | 'safetyIssueRecord' | 'hazardNotice' | 'training' | 'safetyPatrolChecklist';
    applyDate: string | Date;
    createdAt: string | Date;
    createdBy: string;
    updatedAt?: string | Date;
    updatedBy?: string;
}