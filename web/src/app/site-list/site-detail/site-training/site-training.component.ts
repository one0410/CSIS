import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { MongodbService } from '../../../services/mongodb.service';
import { TrainingForm } from './training-form/training-form.component';

@Component({
  selector: 'app-site-training',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './site-training.component.html',
  styleUrls: ['./site-training.component.scss']
})
export class SiteTrainingComponent implements OnInit {
  trainingForms = signal<TrainingForm[]>([]);
  siteId: string = '';

  constructor(
    private mongodbService: MongodbService,
    private router: Router,
    private route: ActivatedRoute
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

    this.trainingForms.set(allForms);
  }

  createNewTraining() {
    this.router.navigate(['/site', this.siteId, 'forms', 'create-training']);
  }

  // 查看詳細資料
  viewTraining(trainingId: string) {
    this.router.navigate(['/site', this.siteId, 'forms', 'training', trainingId]);
  }

  // 編輯教育訓練表單
  editTraining(trainingId: string) {
    this.router.navigate(['/site', this.siteId, 'forms', 'training', trainingId, 'edit']);
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
    if (!training.participants) {
      return 0;
    }
    return training.participants.filter(
      participant => participant.signatureData && participant.signatureData.trim() !== ''
    ).length;
  }
}
