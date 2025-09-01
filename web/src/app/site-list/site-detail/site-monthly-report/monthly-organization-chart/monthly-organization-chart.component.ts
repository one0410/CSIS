import { Component, Input, OnInit, OnChanges, OnDestroy, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongodbService } from '../../../../services/mongodb.service';
import { CurrentSiteService } from '../../../../services/current-site.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-monthly-organization-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card h-100">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">
          <i class="fas fa-sitemap me-2"></i>組織圖
        </h6>
        <small class="text-muted">{{ formatMonth(selectedMonth) }}</small>
      </div>
      <div class="card-body">
        @if (isLoading()) {
          <div class="text-center">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">載入中...</span>
            </div>
          </div>
        } @else if (supervisorUnits().length === 0) {
          <div class="text-center text-muted">
            <i class="fas fa-sitemap fs-1 mb-2 opacity-50"></i>
            <p class="mb-0">本月無工地許可單</p>
            <small>暫無可顯示的監工單位</small>
          </div>
        } @else {
          <div class="tree-container">
            <ul class="tree-root">
              <li>
                <div class="node root">帆宣</div>
                <ul class="children">
                  @for (unit of supervisorUnits(); track unit) {
                    <li>
                      <div class="node leaf">{{ unit }}</div>
                    </li>
                  }
                </ul>
              </li>
            </ul>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .tree-container {
      overflow-x: auto;
      padding: 0.5rem 0;
    }
    .tree-root, .children {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tree-root > li { position: relative; padding-left: 0; }
    .children > li {
      position: relative;
      padding-left: 1.25rem;
      margin: 0.5rem 0;
    }
    .children > li::before {
      content: '';
      position: absolute;
      left: 0.5rem;
      top: -0.25rem;
      bottom: -0.25rem;
      width: 1px;
      background: #dee2e6;
    }
    /* 最後一個子節點：將垂直線截斷於節點水平線，呈現 L 型 */
    .children > li:last-child::before {
      bottom: auto;
      height: 1rem; /* -0.25rem 到 0.75rem (節點水平線位置) */
    }
    .children > li::after {
      content: '';
      position: absolute;
      left: 0.5rem;
      top: 0.75rem;
      width: 0.75rem;
      height: 1px;
      background: #dee2e6;
    }
    .node {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border: 1px solid #dee2e6;
      border-radius: 0.25rem;
      background: #f8f9fa;
      font-size: 0.9rem;
    }
    .node.root { font-weight: 600; background: #e9ecef; }
  `]
})
export class MonthlyOrganizationChartComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedMonth!: string;

  private mongodbService = inject(MongodbService);
  private currentSiteService = inject(CurrentSiteService);

  supervisorUnits = signal<string[]>([]);
  isLoading = signal<boolean>(false);

  private lastLoadedMonth: string | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isDestroyed = false;

  constructor() {
    effect(() => {
      const currentSite = this.currentSiteService.currentSite();
      if (currentSite?._id && this.selectedMonth && !this.isDestroyed) {
        this.loadMonthlySupervisors();
      }
    });
  }

  ngOnInit(): void {}
  ngOnChanges(): void {
    const currentSite = this.currentSiteService.currentSite();
    if (currentSite?._id && this.selectedMonth && this.selectedMonth !== this.lastLoadedMonth) {
      this.loadMonthlySupervisors();
    }
  }
  ngOnDestroy(): void { this.isDestroyed = true; }

  private async loadMonthlySupervisors(): Promise<void> {
    if (!this.selectedMonth || this.selectedMonth === this.lastLoadedMonth) return;
    if (this.loadingPromise) { await this.loadingPromise; return; }

    const currentSite = this.currentSiteService.currentSite();
    if (!currentSite?._id) { this.supervisorUnits.set([]); return; }

    this.isLoading.set(true);
    this.lastLoadedMonth = this.selectedMonth;
    this.loadingPromise = this.performLoad(currentSite._id, this.selectedMonth);
    await this.loadingPromise;
    this.loadingPromise = null;
  }

  private async performLoad(siteId: string, monthStr: string): Promise<void> {
    try {
      const startDate = dayjs(monthStr).startOf('month').format('YYYY-MM-DD');
      const endDate = dayjs(monthStr).endOf('month').format('YYYY-MM-DD');

      const query = {
        siteId,
        formType: 'sitePermit',
        applyDate: { $gte: startDate, $lte: endDate }
      } as const;

      const permits = await this.mongodbService.getArray('siteForm', query);
      if (!permits || !Array.isArray(permits)) {
        this.supervisorUnits.set([]);
        return;
      }

      const set = new Set<string>();
      permits.forEach((p: any) => {
        const unit = (p.supervisor || '').toString().trim();
        if (unit) set.add(unit);
      });
      this.supervisorUnits.set(Array.from(set).sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      console.error('載入月份監工單位失敗:', error);
      this.supervisorUnits.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  formatMonth(monthStr: string): string {
    return dayjs(monthStr).format('YYYY年MM月');
  }
}


