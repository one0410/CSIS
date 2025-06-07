import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormVersion, SiteFormConfig } from '../shared/form-version.model';
import { MongodbService } from '../../../services/mongodb.service';
import { Site } from '../../../site-list/site-list.component';
import dayjs from 'dayjs';

@Component({
  selector: 'app-site-config',
  templateUrl: './site-config.component.html',
  styleUrls: ['./site-config.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class SiteConfigComponent implements OnInit {
  // 工地列表
  sites: Site[] = [];

  // 各表單版本列表
  sitePermitVersions: FormVersion[] = [];

  toolboxMeetingVersions: FormVersion[] = [];

  safetyChecklistVersions: FormVersion[] = [];

  // 工地表單配置
  siteConfigs: SiteFormConfig[] = [];

  selectedSite: Site | null = null;
  selectedConfig: SiteFormConfig | null = null;
  isEditing: boolean = false;

  constructor(private mongodbService: MongodbService) {}

  async ngOnInit(): Promise<void> {
    // 找出未過期工地
    this.sites = await this.mongodbService.get('site', {
      enabled: { $ne: false },
      endDate: { $gte: dayjs().format('YYYY-MM-DD') },
    });

    this.siteConfigs = await this.mongodbService.get('siteFormConfig', {});

    const allForms = await this.mongodbService.get('formVersion', {}) as FormVersion[];
    this.sitePermitVersions = allForms.filter(
      (form) => form.type === 'sitePermit'
    );
    this.toolboxMeetingVersions = allForms.filter(
      (form) => form.type === 'toolboxMeeting'
    );
    this.safetyChecklistVersions = allForms.filter(
      (form) => form.type === 'safetyChecklist'
    );
  }

  selectSite(site: Site): void {
    this.selectedSite = site;
    this.selectedConfig =
      this.siteConfigs.find((config) => config.siteId === site._id) || null;
    this.isEditing = false;
  }

  editConfig(): void {
    this.isEditing = true;
  }

  async saveConfig(): Promise<void> {
    if (this.selectedSite && this.selectedConfig) {
      const index = this.siteConfigs.findIndex(
        (config) => config.siteId === this.selectedSite?._id
      );

      if (index !== -1) {
        // 更新現有配置
        this.siteConfigs[index] = {
          ...this.selectedConfig,
          updatedAt: new Date(),
        };

        let response = await this.mongodbService.put(
          'siteFormConfig',
          this.siteConfigs[index]._id!,
          this.siteConfigs[index]
        );
      } else {
        const newConfig: SiteFormConfig = {
          siteId: this.selectedSite._id!,
          siteName: this.selectedSite.projectName,
          sitePermitVersionId: this.selectedConfig.sitePermitVersionId,
          toolboxMeetingVersionId: this.selectedConfig.toolboxMeetingVersionId,
          safetyChecklistVersionId:
            this.selectedConfig.safetyChecklistVersionId,
          updatedAt: new Date(),
        };
        let response = await this.mongodbService.post(
          'siteFormConfig',
          newConfig
        );
        if (response) {
          newConfig._id = response.insertedId;
          // 創建新配置
          this.siteConfigs.push(newConfig);
        }
      }

      this.isEditing = false;
    }
  }

  cancelEdit(): void {
    this.isEditing = false;

    if (this.selectedSite) {
      this.selectedConfig =
        this.siteConfigs.find(
          (config) => config.siteId === this.selectedSite!._id
        ) || null;
    }
  }

  createNewConfig(): void {
    if (this.selectedSite) {
      this.selectedConfig = {
        siteId: this.selectedSite._id!,
        siteName: this.selectedSite.projectName,
        sitePermitVersionId: this.sitePermitVersions[0]._id || '',
        toolboxMeetingVersionId: this.toolboxMeetingVersions[0]._id || '',
        safetyChecklistVersionId: this.safetyChecklistVersions[0]._id || '',
        updatedAt: new Date(),
      };
      this.isEditing = true;
    }
  }

  getVersionName(versionId: string, versionArray: FormVersion[]): string {
    const version = versionArray.find((v) => v._id === versionId);
    return version ? `${version.name} (${version.version})` : '未選擇';
  }
}
