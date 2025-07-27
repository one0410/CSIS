import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../services/mongodb.service';
import { AuthService } from '../../../services/auth.service';
import { TrainingForm } from './training-form/training-form.component';

@Component({
  selector: 'app-site-training',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './site-training.component.html',
  styleUrls: ['./site-training.component.scss']
})
export class SiteTrainingComponent implements OnInit {
  private allTrainingForms = signal<TrainingForm[]>([]);
  showRevokedForms = signal<boolean>(false);
  
  // 使用 computed 來過濾表單資料
  trainingForms = computed(() => {
    const allForms = this.allTrainingForms();
    if (this.showRevokedForms()) {
      return allForms;
    } else {
      return allForms.filter(form => form.status !== 'revoked');
    }
  });
  
  siteId: string = '';

  constructor(
    private mongodbService: MongodbService,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // 獲取工地 ID
    this.route.parent?.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.siteId = id;
        this.loadForms();
      }
    });
  }

  async loadForms(): Promise<void> {
    // 讀取教育訓練表單
    const allForms = await this.mongodbService.get('siteForm', {
      siteId: this.siteId,
      formType: 'training',
    });

    this.allTrainingForms.set(allForms);
  }

  createNewTraining() {
    this.router.navigate(['/site', this.siteId, 'training', 'create']);
  }

  // 查看詳細資料
  viewTraining(trainingId: string) {
    this.router.navigate(['/site', this.siteId, 'training', trainingId]);
  }

  // 編輯教育訓練表單
  editTraining(trainingId: string) {
    this.router.navigate(['/site', this.siteId, 'training', trainingId, 'edit']);
  }

  // 檢查當前使用者是否有權限顯示作廢表單開關
  canShowRevokedFormsSwitch(): boolean {
    const user = this.authService.user();
    if (!user || !this.siteId) return false;
    
    // 取得當前使用者在此工地的角色
    const userSiteRole = user.belongSites?.find(site => site.siteId === this.siteId)?.role;
    
    // 只有專案經理(projectManager)和專案秘書(secretary)可以顯示開關
    return userSiteRole === 'projectManager' || userSiteRole === 'secretary';
  }

  // 切換顯示作廢表單
  toggleShowRevokedForms() {
    this.showRevokedForms.set(!this.showRevokedForms());
  }

  // 作廢教育訓練表單
  async revokeTraining(trainingId: string) {
    if (confirm('確定要作廢此教育訓練表單嗎？此操作無法恢復。')) {
      try {
        await this.mongodbService.patch('siteForm', trainingId, {
          status: 'revoked'
        });
        // 重新載入表單列表
        await this.loadForms();
      } catch (error) {
        console.error('作廢教育訓練表單失敗', error);
        alert('作廢教育訓練表單失敗');
      }
    }
  }
  
  getStatusName(status: string) {
    switch (status) {
      case 'draft':
        return '草稿';
      case 'published':
        return '已發布';
      case 'revoked':
        return '已作廢';
    }
    return status;
  }

  // 計算有簽到的參與者人數
  getSignedParticipantsCount(training: TrainingForm): number {
    if (!training.workerSignatures) {
      return 0;
    }
    return training.workerSignatures.length;
  }

  // 回復作廢的教育訓練表單
  async restoreTraining(trainingId: string) {
    if (confirm('確定要回復此教育訓練表單的狀態嗎？')) {
      try {
        await this.mongodbService.patch('siteForm', trainingId, {
          status: 'draft'
        });
        // 重新載入表單列表
        await this.loadForms();
      } catch (error) {
        console.error('回復教育訓練表單失敗', error);
        alert('回復教育訓練表單失敗');
      }
    }
  }

  // 永久刪除教育訓練表單
  async deleteTraining(trainingId: string) {
    if (confirm('確定要永久刪除此教育訓練表單嗎？此操作無法恢復，請謹慎操作！')) {
      if (confirm('再次確認：您真的要永久刪除此表單嗎？')) {
        try {
          await this.mongodbService.delete('siteForm', trainingId);
          // 重新載入表單列表
          await this.loadForms();
        } catch (error) {
          console.error('刪除教育訓練表單失敗', error);
          alert('刪除教育訓練表單失敗');
        }
      }
    }
  }
}
