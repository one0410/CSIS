import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from './auth.guard';
import { SettingComponent } from './home/setting/setting.component';
import { UserDetailComponent } from './home/setting/user-list/user-detail/user-detail.component';
import { UserListComponent } from './home/setting/user-list/user-list.component';
import { WorkerDetailComponent } from './home/worker-list/worker-detail/worker-detail.component';
import { WorkerListComponent } from './home/worker-list/worker-list.component';
import { SiteListComponent } from './site-list/site-list.component';
import { SiteDetailComponent } from './site-list/site-detail/site-detail.component';
import { ProfileComponent } from './home/profile/profile.component';
import { SiteDashboardComponent } from './site-list/site-dashboard/site-dashboard.component';
import { NewSiteComponent } from './site-list/new-site/new-site.component';
import { DashboardComponent } from './home/dashboard/dashboard.component';
import { SiteSelectorComponent } from './site-selector/site-selector.component';
import { FormConfigComponent } from './home/form-config/form-config.component';
import { SitePermitComponent } from './home/form-config/site-permit/site-permit.component';
import { ToolboxMeetingComponent } from './home/form-config/toolbox-meeting/toolbox-meeting.component';
import { SafetyChecklistComponent } from './home/form-config/safety-checklist/safety-checklist.component';
import { SiteConfigComponent } from './home/form-config/site-config/site-config.component';
import { SitePermitFormComponent } from './site-list/site-detail/site-form-list/site-permit-form/site-permit-form.component';
import { ToolboxMeetingFormComponent } from './site-list/site-detail/site-form-list/toolbox-meeting-form/toolbox-meeting-form.component';
import { SiteBasicInfoComponent } from './site-list/site-detail/site-basic-info/site-basic-info.component';
import { SiteProgressComponent } from './site-list/site-detail/site-progress/site-progress.component';
import { SitePhotosComponent } from './site-list/site-detail/site-photos/site-photos.component';
import { SiteFormListComponent } from './site-list/site-detail/site-form-list/site-form-list.component';
import { SiteBlankFormComponent } from './site-list/site-detail/site-blank-form/site-blank-form.component';
import { SiteUserListComponent } from './site-list/site-detail/site-user-list/site-user-list.component';
import { SiteWorkerListComponent } from './site-list/site-detail/site-worker-list/site-worker-list.component';
import { EnvironmentCheckListComponent } from './site-list/site-detail/site-form-list/environment-check-list/environment-check-list.component';
import { SiteHazardNoticeComponent } from './site-list/site-detail/site-hazard-notice/site-hazard-notice.component';
import { HazardNoticeFormComponent } from './site-list/site-detail/site-hazard-notice/hazard-notice-form/hazard-notice-form.component';
import { SiteTrainingComponent } from './site-list/site-detail/site-training/site-training.component';
import { TrainingFormComponent } from './site-list/site-detail/site-training/training-form/training-form.component';
import { SpecialWorkChecklistComponent } from './site-list/site-detail/site-form-list/special-work-checklist/special-work-checklist.component';
import { SafetyIssueRecordComponent } from './site-list/site-detail/site-form-list/safety-issue-record/safety-issue-record.component';
import { SafetyPatrolChecklistComponent } from './site-list/site-detail/site-form-list/safety-patrol-checklist/safety-patrol-checklist.component';
import { SiteDashboardWeatherComponent } from './site-list/site-dashboard/site-dashboard-weather/site-dashboard-weather.component';
import { SiteDashboardPermitComponent } from './site-list/site-dashboard/site-dashboard-permit/site-dashboard-permit.component';
import { SiteDashboardFlawComponent } from './site-list/site-dashboard/site-dashboard-flaw/site-dashboard-flaw.component';
import { SiteFormContainerComponent } from './site-list/site-detail/site-form-container/site-form-container.component';
import { SiteEquipmentComponent } from './site-list/site-detail/site-equipment/site-equipment.component';
import { EquipmentDetailComponent } from './site-list/site-detail/site-equipment/equipment-detail/equipment-detail.component';
import { FeedbackComponent } from './home/feedback/feedback.component';
import { FeedbackAdminComponent } from './home/feedback-admin/feedback-admin.component';
import { WorkerHistoryComponent } from './worker-history/worker-history.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'site-selector',
    component: SiteSelectorComponent,
    canActivate: [AuthGuard],
  },
  // 工人簽名專用路由 - 不需要登入
  { 
    path: 'site/:id/hazardNotice/:formId', 
    component: HazardNoticeFormComponent 
  },
  { 
    path: 'site/:id/training/:formId', 
    component: TrainingFormComponent 
  },
  {
    path: '',
    component: HomeComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'feedback', component: FeedbackComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'dashboard/:id', component: SiteDashboardComponent },
      { path: 'worker', component: WorkerListComponent },
      { path: 'worker/:id', component: WorkerDetailComponent },
      { path: 'worker-history/:id', component: WorkerHistoryComponent },
      { path: 'feedback-admin', component: FeedbackAdminComponent },
      { path: 'user', component: UserListComponent },
      { path: 'user/:id', component: UserDetailComponent },
      { path: 'sitelist', component: SiteListComponent },
      { path: 'site/new', component: NewSiteComponent },
      {
        path: 'site/:id',
        component: SiteDetailComponent,
        children: [
          { path: '', redirectTo: 'overview', pathMatch: 'full' },
          { path: 'overview', component: SiteBasicInfoComponent },
          { path: 'dashboard', component: SiteDashboardComponent },
          {
            path: 'dashboard/weather',
            component: SiteDashboardWeatherComponent,
          },
          { path: 'dashboard/permit', component: SiteDashboardPermitComponent },
          { path: 'dashboard/flaw', component: SiteDashboardFlawComponent },
          { path: 'schedule', component: SiteProgressComponent },
          { path: 'photos', component: SitePhotosComponent },
          { path: 'forms', component: SiteFormListComponent },
          { path: 'blankForms', component: SiteBlankFormComponent },
          { path: 'userList', component: SiteUserListComponent },
          { path: 'workerList', component: SiteWorkerListComponent },
          { path: 'hazardNotice', component: SiteHazardNoticeComponent },
          { path: 'training', component: SiteTrainingComponent },
          { path: 'equipment', component: SiteEquipmentComponent },
        ],
      },

      { path: 'site/:id/equipment/:equipmentId', component: EquipmentDetailComponent },
      { path: 'site/:id/forms/create-permit', component: SitePermitFormComponent },
      { path: 'site/:id/forms/create-toolbox-meeting', component: ToolboxMeetingFormComponent },
      { path: 'site/:id/forms/create-environment-check-list', component: EnvironmentCheckListComponent },
      { path: 'site/:id/forms/create-special-work-checklist', component: SpecialWorkChecklistComponent },
      { path: 'site/:id/forms/create-safety-issue-record', component: SafetyIssueRecordComponent },
      { path: 'site/:id/forms/create-safety-patrol-checklist', component: SafetyPatrolChecklistComponent },
      { path: 'site/:id/forms/create-safety-checklist', component: SitePermitFormComponent },
      { path: 'site/:id/forms/permit/:formId', component: SitePermitFormComponent },
      { path: 'site/:id/forms/toolbox-meeting/:formId', component: ToolboxMeetingFormComponent },
      { path: 'site/:id/forms/environment-check-list/:formId', component: EnvironmentCheckListComponent },
      { path: 'site/:id/forms/special-work-checklist/:formId', component: SpecialWorkChecklistComponent },
      { path: 'site/:id/forms/safety-issue-record/:formId', component: SafetyIssueRecordComponent },
      { path: 'site/:id/forms/safety-patrol-checklist/:formId', component: SafetyPatrolChecklistComponent },
      { path: 'site/:id/forms/safety-checklist/:formId', component: SitePermitFormComponent },
      { path: 'site/:id/forms/view/:formId', component: SitePermitFormComponent },
      { path: 'site/:id/forms/create-hazard-notice', component: HazardNoticeFormComponent },
      { path: 'site/:id/forms/hazard-notice/:formId', component: HazardNoticeFormComponent },
      { path: 'site/:id/forms/hazard-notice/:formId/edit', component: HazardNoticeFormComponent },
      { path: 'site/:id/forms/create-training', component: TrainingFormComponent },
      { path: 'site/:id/forms/training/:formId', component: TrainingFormComponent },
      { path: 'site/:id/forms/training/:formId/edit', component: TrainingFormComponent },
      {
        path: 'setting',
        component: SettingComponent,
        canActivate: [AuthGuard],
        children: [
          { path: 'user', component: UserListComponent },
          { path: 'user/:id', component: UserDetailComponent },
        ],
      },
      // {
      //   path: 'form-config',
      //   component: FormConfigComponent,
      //   children: [
      //     { path: '', redirectTo: 'site-permit', pathMatch: 'full' },
      //     { path: 'site-permit', component: SitePermitComponent },
      //     { path: 'toolbox-meeting', component: ToolboxMeetingComponent },
      //     { path: 'safety-checklist', component: SafetyChecklistComponent },
      //     { path: 'site-config', component: SiteConfigComponent },
      //   ],
      // },
    ],
  },
];
