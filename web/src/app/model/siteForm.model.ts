export interface SiteForm {
    _id?: string;
    siteId: string;
    formType: 'sitePermit' | 'toolboxMeeting' | 'environmentChecklist' | 'specialWorkChecklist' | 'defectRecord' | 'safetyIssueRecord' | 'hazardNotice' | 'training' | 'safetyPatrolChecklist';
    applyDate: string;
    createdAt: Date;
    createdBy: string;
    updatedAt?: Date;
    updatedBy?: string;
}