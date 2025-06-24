import { Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { 
    path: 'login', 
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'site-selector',
    loadComponent: () => import('./site-selector/site-selector.component').then(m => m.SiteSelectorComponent),
    canActivate: [AuthGuard],
  },
  
  // 工人簽名專用路由 - 不需要登入
  { 
    path: 'site/:id/hazardNotice/:formId', 
    loadComponent: () => import('./site-list/site-detail/site-hazard-notice/hazard-notice-form/hazard-notice-form.component').then(m => m.HazardNoticeFormComponent)
  },
  { 
    path: 'site/:id/training/:formId', 
    loadComponent: () => import('./site-list/site-detail/site-training/training-form/training-form.component').then(m => m.TrainingFormComponent)
  },

  // Home 路由群組
  {
    path: '',
    loadComponent: () => import('./home/home.component').then(m => m.HomeComponent),
    canActivate: [AuthGuard],
    children: [
      { 
        path: 'feedback', 
        loadComponent: () => import('./home/feedback/feedback.component').then(m => m.FeedbackComponent)
      },
      { 
        path: 'profile', 
        loadComponent: () => import('./home/profile/profile.component').then(m => m.ProfileComponent)
      },
      { 
        path: 'dashboard', 
        loadComponent: () => import('./home/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      { 
        path: 'dashboard/:id', 
        loadComponent: () => import('./site-list/site-dashboard/site-dashboard.component').then(m => m.SiteDashboardComponent)
      },
      
      // Worker 相關路由
      { 
        path: 'worker', 
        loadComponent: () => import('./home/worker-list/worker-list.component').then(m => m.WorkerListComponent)
      },
      { 
        path: 'worker/:id', 
        loadComponent: () => import('./home/worker-list/worker-detail/worker-detail.component').then(m => m.WorkerDetailComponent)
      },
      { 
        path: 'worker-history/:id', 
        loadComponent: () => import('./worker-history/worker-history.component').then(m => m.WorkerHistoryComponent)
      },
      
      // Admin 功能
      { 
        path: 'feedback-admin', 
        loadComponent: () => import('./home/feedback-admin/feedback-admin.component').then(m => m.FeedbackAdminComponent)
      },
      { 
        path: 'user', 
        loadComponent: () => import('./home/setting/user-list/user-list.component').then(m => m.UserListComponent)
      },
      { 
        path: 'user/:id', 
        loadComponent: () => import('./home/setting/user-list/user-detail/user-detail.component').then(m => m.UserDetailComponent)
      },
      
      // Site 相關路由
      { 
        path: 'sitelist', 
        loadComponent: () => import('./site-list/site-list.component').then(m => m.SiteListComponent)
      },
      { 
        path: 'site/new', 
        loadComponent: () => import('./site-list/new-site/new-site.component').then(m => m.NewSiteComponent)
      },
      
      // Site Detail 路由群組
      {
        path: 'site/:id',
        loadComponent: () => import('./site-list/site-detail/site-detail.component').then(m => m.SiteDetailComponent),
        children: [
          { path: '', redirectTo: 'overview', pathMatch: 'full' },
          { 
            path: 'overview', 
            loadComponent: () => import('./site-list/site-detail/site-basic-info/site-basic-info.component').then(m => m.SiteBasicInfoComponent)
          },
          { 
            path: 'dashboard', 
            loadComponent: () => import('./site-list/site-dashboard/site-dashboard.component').then(m => m.SiteDashboardComponent)
          },
          {
            path: 'dashboard/weather',
            loadComponent: () => import('./site-list/site-dashboard/site-dashboard-weather/site-dashboard-weather.component').then(m => m.SiteDashboardWeatherComponent)
          },
          { 
            path: 'dashboard/permit', 
            loadComponent: () => import('./site-list/site-dashboard/site-dashboard-permit/site-dashboard-permit.component').then(m => m.SiteDashboardPermitComponent)
          },
          { 
            path: 'dashboard/flaw', 
            loadComponent: () => import('./site-list/site-dashboard/site-dashboard-flaw/site-dashboard-flaw.component').then(m => m.SiteDashboardFlawComponent)
          },
          { 
            path: 'schedule', 
            loadComponent: () => import('./site-list/site-detail/site-progress/site-progress.component').then(m => m.SiteProgressComponent)
          },
          { 
            path: 'photos', 
            loadComponent: () => import('./site-list/site-detail/site-photos/site-photos.component').then(m => m.SitePhotosComponent)
          },
          { 
            path: 'forms', 
            loadComponent: () => import('./site-list/site-detail/site-form-list/site-form-list.component').then(m => m.SiteFormListComponent)
          },
          { 
            path: 'blankForms', 
            loadComponent: () => import('./site-list/site-detail/site-blank-form/site-blank-form.component').then(m => m.SiteBlankFormComponent)
          },
          { 
            path: 'userList', 
            loadComponent: () => import('./site-list/site-detail/site-user-list/site-user-list.component').then(m => m.SiteUserListComponent)
          },
          { 
            path: 'workerList', 
            loadComponent: () => import('./site-list/site-detail/site-worker-list/site-worker-list.component').then(m => m.SiteWorkerListComponent)
          },
          { 
            path: 'visitorList', 
            loadComponent: () => import('./site-list/site-detail/site-visitor-list/site-visitor-list.component').then(m => m.SiteVisitorListComponent)
          },
          { 
            path: 'hazardNotice', 
            loadComponent: () => import('./site-list/site-detail/site-hazard-notice/site-hazard-notice.component').then(m => m.SiteHazardNoticeComponent)
          },
          { 
            path: 'training', 
            loadComponent: () => import('./site-list/site-detail/site-training/site-training.component').then(m => m.SiteTrainingComponent)
          },
          { 
            path: 'equipment', 
            loadComponent: () => import('./site-list/site-detail/site-equipment/site-equipment.component').then(m => m.SiteEquipmentComponent)
          },
        ],
      },

      // Site 相關表單路由
      { 
        path: 'site/:id/equipment/:equipmentId', 
        loadComponent: () => import('./site-list/site-detail/site-equipment/equipment-detail/equipment-detail.component').then(m => m.EquipmentDetailComponent)
      },
      
      // 表單建立路由
      { 
        path: 'site/:id/forms/create-permit', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/site-permit-form/site-permit-form.component').then(m => m.SitePermitFormComponent)
      },
      { 
        path: 'site/:id/forms/create-toolbox-meeting', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/toolbox-meeting-form/toolbox-meeting-form.component').then(m => m.ToolboxMeetingFormComponent)
      },
      { 
        path: 'site/:id/forms/create-environment-check-list', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/environment-check-list/environment-check-list.component').then(m => m.EnvironmentCheckListComponent)
      },
      { 
        path: 'site/:id/forms/create-special-work-checklist', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/special-work-checklist/special-work-checklist.component').then(m => m.SpecialWorkChecklistComponent)
      },
      { 
        path: 'site/:id/forms/create-safety-issue-record', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/safety-issue-record/safety-issue-record.component').then(m => m.SafetyIssueRecordComponent)
      },
      { 
        path: 'site/:id/forms/create-safety-patrol-checklist', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/safety-patrol-checklist/safety-patrol-checklist.component').then(m => m.SafetyPatrolChecklistComponent)
      },
      { 
        path: 'site/:id/forms/create-safety-checklist', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/site-permit-form/site-permit-form.component').then(m => m.SitePermitFormComponent)
      },
      
      // 表單檢視/編輯路由
      { 
        path: 'site/:id/forms/permit/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/site-permit-form/site-permit-form.component').then(m => m.SitePermitFormComponent)
      },
      { 
        path: 'site/:id/forms/toolbox-meeting/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/toolbox-meeting-form/toolbox-meeting-form.component').then(m => m.ToolboxMeetingFormComponent)
      },
      { 
        path: 'site/:id/forms/environment-check-list/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/environment-check-list/environment-check-list.component').then(m => m.EnvironmentCheckListComponent)
      },
      { 
        path: 'site/:id/forms/special-work-checklist/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/special-work-checklist/special-work-checklist.component').then(m => m.SpecialWorkChecklistComponent)
      },
      { 
        path: 'site/:id/forms/safety-issue-record/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/safety-issue-record/safety-issue-record.component').then(m => m.SafetyIssueRecordComponent)
      },
      { 
        path: 'site/:id/forms/safety-patrol-checklist/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/safety-patrol-checklist/safety-patrol-checklist.component').then(m => m.SafetyPatrolChecklistComponent)
      },
      { 
        path: 'site/:id/forms/safety-checklist/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/site-permit-form/site-permit-form.component').then(m => m.SitePermitFormComponent)
      },
      { 
        path: 'site/:id/forms/view/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-form-list/site-permit-form/site-permit-form.component').then(m => m.SitePermitFormComponent)
      },
      
      // 危險告知與教育訓練
      { 
        path: 'site/:id/forms/create-hazard-notice', 
        loadComponent: () => import('./site-list/site-detail/site-hazard-notice/hazard-notice-form/hazard-notice-form.component').then(m => m.HazardNoticeFormComponent)
      },
      { 
        path: 'site/:id/forms/hazard-notice/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-hazard-notice/hazard-notice-form/hazard-notice-form.component').then(m => m.HazardNoticeFormComponent)
      },
      { 
        path: 'site/:id/forms/hazard-notice/:formId/edit', 
        loadComponent: () => import('./site-list/site-detail/site-hazard-notice/hazard-notice-form/hazard-notice-form.component').then(m => m.HazardNoticeFormComponent)
      },
      { 
        path: 'site/:id/forms/create-training', 
        loadComponent: () => import('./site-list/site-detail/site-training/training-form/training-form.component').then(m => m.TrainingFormComponent)
      },
      { 
        path: 'site/:id/forms/training/:formId', 
        loadComponent: () => import('./site-list/site-detail/site-training/training-form/training-form.component').then(m => m.TrainingFormComponent)
      },
      { 
        path: 'site/:id/forms/training/:formId/edit', 
        loadComponent: () => import('./site-list/site-detail/site-training/training-form/training-form.component').then(m => m.TrainingFormComponent)
      },
      
      // Setting 路由群組
      {
        path: 'setting',
        loadComponent: () => import('./home/setting/setting.component').then(m => m.SettingComponent),
        canActivate: [AuthGuard],
        children: [
          { 
            path: 'user', 
            loadComponent: () => import('./home/setting/user-list/user-list.component').then(m => m.UserListComponent)
          },
          { 
            path: 'user/:id', 
            loadComponent: () => import('./home/setting/user-list/user-detail/user-detail.component').then(m => m.UserDetailComponent)
          },
        ],
      },
    ],
  },
];
