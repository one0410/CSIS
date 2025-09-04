import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  OnDestroy,
  Signal,
  WritableSignal,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
} from 'ag-grid-community';
import { AgGridModule } from 'ag-grid-angular';
import dayjs from 'dayjs';
import { MongodbService } from '../../services/mongodb.service';
import { GridFSService } from '../../services/gridfs.service';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import {
  Certification,
  CertificationType,
  CertificationTypeManager,
  Worker,
} from '../../model/worker.model';

interface WorkerWithFlag extends Worker {
  isValid: WritableSignal<boolean>;
  certifications: CertificationWithFlag[];
}

interface CertificationWithFlag extends Certification {
  isValid: boolean;
}

@Component({
  selector: 'app-worker-list',
  imports: [AgGridModule, RouterModule, CommonModule, FormsModule],
  templateUrl: './worker-list.component.html',
  styleUrl: './worker-list.component.scss',
})
export class WorkerListComponent implements OnDestroy {
  workers: WorkerWithFlag[] = [];
  filteredWorkers: WorkerWithFlag[] = []; // 過濾後的工人資料

  // 分頁相關屬性
  currentPage = 1;
  pageSize = 100; // 每頁顯示100筆
  totalRecords = 0;
  totalPages = 0;
  isLoading = false;

  // 過濾器相關屬性
  selectedContractingCompany = ''; // 選中的承攬公司
  selectedCertificationTypes: string[] = []; // 選中的證照類型（多選）
  contractingCompanies: string[] = []; // 所有承攬公司清單
  contractingCompaniesWithCount: { name: string; count: number }[] = []; // 承攬公司清單含人數統計
  filteredContractingCompanies: { name: string; count: number }[] = []; // 過濾後的承攬公司清單
  companySearchText = ''; // 承攬公司搜尋文字
  certificationTypes: { value: string; label: string }[] = []; // 所有證照類型清單
  isFilterExpanded = false; // 過濾器展開狀態

  // 匯出相關屬性
  selectedWorkerIds: Set<string> = new Set(); // 選中的工人ID集合

  // 匯入處理相關屬性
  isProcessing = false;
  processProgress = 0;
  processStatus = '';
  isCompleted = false; // 追蹤是否已完成處理
  importResult: {
    success: boolean;
    message: string;
    details?: string[];
    formattedErrors?: {
      row: string;
      name: string;
      idno: string;
      errorType: string;
    }[];
    moreErrors?: number;
  } | null = null;

  defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    width: 120,
    autoHeight: true,
  };
  columnDefs: ColDef[] = [
    {
      headerName: '選取',
      field: 'selected',
      width: 40,
      maxWidth: 70,
      pinned: 'left',
      suppressAutoSize: false,
      sortable: false,
      cellStyle: {
        'padding': '0',
        'margin': '0',
      },
      cellRenderer: (params: any) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.height = '100%';
        div.style.cursor = 'pointer';
        div.style.position = 'relative';

        // 創建容器
        const container = document.createElement('div');
        container.style.position = 'relative';
        container.style.width = '40px';
        container.style.height = '40px';
        container.style.borderRadius = '50%';
        container.style.margin = '0';

        if (params.data.profilePicture) {
          // 如果有大頭貼，顯示圖片
          const img = document.createElement('img');
          img.src = params.data.profilePicture;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.borderRadius = '50%';
          img.style.objectFit = 'cover';
          img.style.border = '2px solid #ddd';
          img.alt = '大頭貼';
          img.title = '點擊選取/取消選取';
          container.appendChild(img);
        } else {
          // 如果沒有大頭貼，顯示預設圖示
          const icon = document.createElement('i');
          icon.className = 'fas fa-user-circle';
          icon.style.fontSize = '36px';
          icon.style.color = '#6c757d';
          icon.title = '點擊選取/取消選取';
          icon.style.cursor = 'pointer';
          container.appendChild(icon);
        }

        // 檢查是否選中
        const isSelected = this.selectedWorkerIds.has(params.data._id);
        if (isSelected) {
          // 在右上角添加綠色勾勾
          const checkMark = document.createElement('div');
          checkMark.style.position = 'absolute';
          checkMark.style.top = '-2px';
          checkMark.style.right = '-2px';
          checkMark.style.width = '16px';
          checkMark.style.height = '16px';
          checkMark.style.backgroundColor = '#28a745';
          checkMark.style.borderRadius = '50%';
          checkMark.style.display = 'flex';
          checkMark.style.alignItems = 'center';
          checkMark.style.justifyContent = 'center';
          checkMark.style.border = '2px solid white';
          checkMark.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';

          const checkIcon = document.createElement('i');
          checkIcon.className = 'fas fa-check';
          checkIcon.style.color = 'white';
          checkIcon.style.fontSize = '10px';
          checkIcon.style.fontWeight = 'bold';

          checkMark.appendChild(checkIcon);
          container.appendChild(checkMark);
        }

        // hover 效果
        container.addEventListener('mouseenter', () => {
          container.style.opacity = '0.8';
          container.style.transform = 'scale(1.05)';
          container.style.transition = 'all 0.2s ease';
        });

        container.addEventListener('mouseleave', () => {
          container.style.opacity = '1';
          container.style.transform = 'scale(1)';
        });

        div.appendChild(container);
        return div;
      },
      onCellClicked: (params) => {
        this.toggleWorkerSelection(params.data._id);
        // 刷新這一行以更新顯示
        params.api.refreshCells({ rowNodes: [params.node] });
      },
    },
    {
      headerName: '姓名',
      field: 'name',
      flex: 1,
      minWidth: 100,
      pinned: 'left',
      onCellClicked: (params) => {
        console.log(params);
        // navigate to user detail page
        this.router.navigate(['/admin/worker', params.data._id]);
      },
      cellRenderer: (params: any) => {
        // 檢查 isValid 是否為 Signal 函數，並正確獲取值
        const isValid =
          typeof params.data.isValid === 'function'
            ? params.data.isValid()
            : params.data.isValid;

        // 創建一個 div 元素以確保 HTML 正確渲染
        const div = document.createElement('div');

        // 設置 div 內容
        if (!isValid) {
          div.innerHTML = `${params.data.name} <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>`;
        } else {
          div.innerHTML = params.data.name;
        }

        return div;
      },
    },
    {
      headerName: '性別',
      field: 'gender',
      flex: 1,
      maxWidth: 60,
      pinned: 'left',

      cellRenderer: (params: any) => {
        if (params.data.gender === '男' || params.data.gender === 'male') {
          return '<span class="text-white" style="background-color: #007bff; padding: 2px 4px; border-radius: 4px;">男</span>';
        } else if (
          params.data.gender === '女' ||
          params.data.gender === 'female'
        ) {
          return '<span class="text-white" style="background-color: #dc3545; padding: 2px 4px; border-radius: 4px;">女</span>';
        } else {
          return '未知';
        }
      },
      onCellClicked: (params) => {
        console.log(params);
        // navigate to user detail page
        this.router.navigate(['/admin/worker', params.data._id]);
      },
    },
    {
      headerName: '生日',
      field: 'birthday',
      flex: 1,
      minWidth: 110,
      pinned: 'left',
      suppressAutoSize: true,
      valueGetter: (params) => {
        return (
          params.data.birthday +
          ' (' +
          dayjs().diff(params.data.birthday, 'years') +
          '歲)'
        );
      },
      onCellClicked: (params) => {
        console.log(params);
        // navigate to user detail page
        this.router.navigate(['/admin/worker', params.data._id]);
      },
    },
    { headerName: '血型', field: 'bloodType', flex: 1, minWidth: 60 },
    { headerName: '電話', field: 'tel', flex: 1, minWidth: 110 },
    { headerName: '聯絡人', field: 'liaison', flex: 1, minWidth: 110 },
    {
      headerName: '緊急聯絡電話',
      field: 'emergencyTel',
      flex: 1,
      minWidth: 110,
    },
    { headerName: '聯絡地址', field: 'address', flex: 1, minWidth: 100 },
    {
      headerName: '危害告知日期',
      field: 'hazardNotifyDate',
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: '供應商工安認證編號',
      field: 'supplierIndustrialSafetyNumber',
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: '一般安全衛生教育訓練(6小時)\n發證/回訓日期',
      headerClass: 'wrap-header-cell',
      field: 'generalSafetyTrainingDate',
      flex: 1,
      minWidth: 110,
    },
    {
      headerName: '一般安全衛生教育訓練(6小時)\n應回訓日期(三年減一天)',
      headerClass: 'wrap-header-cell',
      field: 'generalSafetyTrainingDueDate',
      flex: 1,
      minWidth: 110,
    },
    {
      headerName: '勞保申請日期',
      field: 'laborInsuranceApplyDate',
      flex: 1,
      minWidth: 110,
    },
    {
      headerName: '勞工團體入會日期',
      field: 'laborAssociationDate',
      flex: 1,
      minWidth: 110,
    },
    {
      headerName: '意外險',
      field: 'accidentInsurances',
      width: 300,
      cellRenderer: (params: any) => {
        const div = document.createElement('div');
        let result = '';
        if (params.data && params.data.accidentInsurances) {
          params.data.accidentInsurances.forEach((insurance: any) => {
            result += `${dayjs(insurance.start).format('YYYY-MM-DD')} ~ ${dayjs(
              insurance.end
            ).format('YYYY-MM-DD')} (保額: ${insurance.amount} 萬元)`;
            if (dayjs().isAfter(dayjs(insurance.end))) {
              result +=
                '<i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
              div.style.backgroundColor = 'red';
              div.style.color = 'white';
              div.title = '意外險已過期';
            }
            result += '<br>';
          });
        }
        div.innerHTML = result;
        return div;
      },
    },
    {
      headerName: '承攬公司',
      field: 'contractingCompanyName',
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: '次承攬公司',
      field: 'viceContractingCompanyName',
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: '證照',
      field: 'certifications',
      flex: 1,
      minWidth: 100,
      valueGetter: (params) => {
        // 顯示幾張證照
        return params.data.certifications?.length || 0;
      },
    },
    { headerName: '審核人員', field: 'reviewStaff', flex: 1, minWidth: 100 },
    { headerName: '身分證字號', field: 'idno', flex: 1, minWidth: 120 },
    {
      headerName: '高空作業車操作人員(a)',
      field: 'a',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: CertificationWithFlag) => cert.type === CertificationType.A
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');

        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '高空作業車操作人員(a)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '乙級職業安全管理員(bosh)',
      field: 'bosh',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: CertificationWithFlag) => cert.type === CertificationType.BOSH
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '乙級職業安全管理員(bosh)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '甲級職業安全管理員(aos)',
      field: 'aos',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: CertificationWithFlag) => cert.type === CertificationType.AOS
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '甲級職業安全管理員(aos)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '甲級職業衛生管理師(aoh)',
      field: 'aoh',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: CertificationWithFlag) => cert.type === CertificationType.AOH
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '甲級職業衛生管理師(aoh)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '急救人員(fr)',
      field: 'fr',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.FR
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '急救人員(fr)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '缺氧(侷限)作業主管證照(o2)',
      field: 'o2',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.O2
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '缺氧(侷限)作業主管證照(o2)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '有機溶劑作業主管證照(os)',
      field: 'os',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.OS
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '有機溶劑作業主管證照(os)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '施工架組配作業主管證照(sa)',
      field: 'sa',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.SA
        );

        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '施工架組配作業主管證照(sa)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },

    {
      headerName: '營造業職業安全衛生業務主管(s)',
      field: 's',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.S
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '營造業職業安全衛生業務主管(s)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '一般業職業安全衛生業務主管(ma)',
      field: 'ma',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.MA
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '一般業職業安全衛生業務主管(ma)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },

    {
      headerName: '特定化學物質作業主管(sc)',
      field: 'sc',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.SC
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '特定化學物質作業主管(sc)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },

    {
      headerName: '粉塵作業主管(dw)',
      field: 'dw',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.DW
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '粉塵作業主管(dw)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '氧乙炔熔接裝置作業人員(ow)',
      field: 'ow',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.OW
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '氧乙炔熔接裝置作業人員(ow)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },

    {
      headerName: '屋頂作業主管(r)',
      field: 'r',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.R
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '屋頂作業主管(r)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '鋼構組配作業主管證照(ssa)',
      field: 'ssa',
      flex: 1,
      minWidth: 150,

      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.SSA
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '鋼構組配作業主管證照(ssa)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '模板支撐作業主管(fs)',
      field: 'fs',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.FS
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '模板支撐作業主管(fs)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '露天開挖作業主管(pe)',
      field: 'pe',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.PE
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '露天開挖作業主管(pe)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '擋土支撐作業主管(rs)',
      field: 'rs',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications?.find(
          (cert: Certification) => cert.type === CertificationType.RS
        );
        if (!cert) return null;

        let html = `${dayjs(cert.issue).format('YYYY-MM-DD')} ~ ${dayjs(
          cert.withdraw
        ).format('YYYY-MM-DD')}`;

        const div = document.createElement('div');
        // 檢查是否過期
        if (cert.isValid === false) {
          html +=
            ' <i class="fas fa-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '擋土支撐作業主管(rs)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
  ];

  gridOptions: GridOptions = {
    autoSizeStrategy: {
      type: 'fitCellContents',
    },
    pagination: true,
    paginationPageSize: 100,
    paginationPageSizeSelector: [50, 100, 200, 500],
    // AG-Grid 34.x 伺服器端分頁設定
    // 注意：伺服器端分頁需要特殊的資料結構和設定
    defaultColDef: this.defaultColDef,
    columnDefs: this.columnDefs,
    rowHeight: 40,
    rowData: this.filteredWorkers,
    getRowClass: (params) => {
      // 為選中的行添加 CSS 類
      if (params.data._id && this.selectedWorkerIds.has(params.data._id)) {
        return 'selected-worker';
      }
      return '';
    },
  };

  api: GridApi | undefined;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private mongodbService: MongodbService,
    private gridFSService: GridFSService
  ) { }

  ngOnDestroy() {
    // 組件銷毀時清理 modal 狀態
    this.cleanupModalState();
  }

  async ngOnInit() {
    // 從 URL 參數讀取篩選條件
    this.loadFiltersFromUrl();
    await this.loadWorkersData();
  }

  // 從 URL 參數讀取篩選條件
  private loadFiltersFromUrl() {
    this.route.queryParams.subscribe(params => {
      // 讀取承攬公司篩選條件
      if (params['company']) {
        this.selectedContractingCompany = params['company'];
      }

      // 讀取證照類型篩選條件
      if (params['cert']) {
        // 支援多個證照類型，用逗號分隔
        this.selectedCertificationTypes = params['cert'].split(',').filter((cert: string) => cert.trim());
      }
    });
  }

  // 將篩選條件同步到 URL 參數
  private updateUrlWithFilters() {
    const queryParams: any = {};

    // 承攬公司篩選條件
    if (this.selectedContractingCompany) {
      queryParams['company'] = this.selectedContractingCompany;
    }

    // 證照類型篩選條件
    if (this.selectedCertificationTypes.length > 0) {
      queryParams['cert'] = this.selectedCertificationTypes.join(',');
    }

    // 更新 URL，但不觸發導航
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true // 使用 replaceUrl 避免在瀏覽器歷史中產生多個記錄
    });
  }

  // 載入工人資料（一次載入所有資料，優化傳輸）
  async loadWorkersData() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    try {
      // 構建查詢條件
      const filter = this.buildFilterCondition();
      
      // 一次載入所有資料，但排除圖片欄位以減少傳輸大小
      const result = await this.mongodbService.get('worker', filter, {
        limit: 0, // 0 表示載入所有資料
        sort: { name: 1 }, // 按姓名排序
        projection: {
          // 排除圖片欄位以減少傳輸大小
          profilePicture: 0,
          idCardFrontPicture: 0,
          idCardBackPicture: 0,
          laborInsurancePicture: 0,
          sixHourTrainingFrontPicture: 0,
          sixHourTrainingBackPicture: 0,
          medicalExamPictures: 0,
          // 排除證照圖片欄位
          'certifications.frontPicture': 0,
          'certifications.backPicture': 0
        }
      });

      // 現在 result 總是 PaginatedResult<T> 格式
      let workers = result.data as WorkerWithFlag[];
      const pagination = result.pagination;

      // 處理舊資料遷移：將 picture 欄位移到 pictures 陣列
      workers = this.migrateAccidentInsuranceData(workers);

      // 更新分頁資訊（基於實際載入的資料）
      this.totalRecords = pagination.count;
      this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
      console.log('資料載入完成:', { 
        count: this.totalRecords, 
        totalPages: this.totalPages, 
        currentPage: this.currentPage,
        actualDataSize: workers.length 
      });

      // 處理空資料的情況 - 只有在查詢成功且完全沒有任何資料時才生成測試資料
      if (workers && workers.length === 0 && this.currentPage === 1 && this.totalRecords === 0) {
        console.log('查詢成功但沒有找到任何人員資料，檢查是否需要生成測試資料...');
        
        try {
          // 再次確認資料庫中完全沒有任何人員資料
          const allWorkers = await this.mongodbService.getArray<Worker>('worker', {});
          
          // 只有當資料庫中完全沒有任何人員資料時，才生成測試資料
          if (allWorkers.length === 0) {
            console.log('確認資料庫中完全沒有任何人員資料，開始生成 5 筆測試人員資料...');
            workers = Array.from({ length: 5 }, (_, index) =>
              this.generateRandomWorker(index)
            );

            for (const worker of workers) {
              let result = await this.mongodbService.post('worker', worker);
              if (result.insertedId) {
                worker._id = result.insertedId;
              }
            }
            console.log('測試人員資料生成完成');
          } else {
            console.log(`資料庫中已存在 ${allWorkers.length} 筆人員資料，跳過生成測試資料`);
          }
        } catch (testDataError) {
          console.error('檢查或生成測試資料時發生錯誤:', testDataError);
          // 如果檢查測試資料失敗，不要生成新的測試資料
        }
      }

      // 轉換普通 Worker 為 WorkerWithFlag
      this.workers = workers.map((worker) => {
        const workerWithFlag = worker as unknown as WorkerWithFlag;
        workerWithFlag.isValid = signal(true);
        workerWithFlag.certifications =
          worker.certifications as CertificationWithFlag[];
        return workerWithFlag;
      });

      console.log(`載入了第 ${this.currentPage} 頁，共 ${this.workers.length} 筆工人資料，總計 ${this.totalRecords} 筆`);

      // 檢查意外險或證照是否過期
      for (const worker of this.workers) {
        this.checkWorkerValidity(worker);
      }

      // 初始化過濾器選項（只在第一頁時執行）
      if (this.currentPage === 1) {
        await this.initializeFilterOptions();
      }

      // 更新表格資料
      this.filteredWorkers = [...this.workers];
      
      if (this.api) {
        // 設定 AG-Grid 的資料
        this.api.setGridOption('rowData', this.filteredWorkers);
        
        // 啟用 AG-Grid 的客戶端分頁（所有資料都在客戶端）
        this.api.setGridOption('pagination', true);
        console.log('啟用 AG-Grid 客戶端分頁:', { 
          totalRecords: this.totalRecords, 
          totalPages: this.totalPages,
          actualDataSize: this.filteredWorkers.length 
        });
        
        // 設定分頁大小
        this.api.setGridOption('paginationPageSize', this.pageSize);
        
        // 重置到第一頁
        this.api.paginationGoToPage(0);
        
        console.log('AG-Grid 客戶端分頁設定完成:', {
          pageSize: this.pageSize,
          totalRecords: this.totalRecords,
          totalPages: this.totalPages,
          rowCount: this.filteredWorkers.length
        });
      }
    } catch (error) {
      console.error('載入工人資料時發生錯誤:', error);
      // 查詢失敗時，設定空陣列避免後續處理錯誤
      this.workers = [];
      this.filteredWorkers = [];
      this.totalRecords = 0;
      this.totalPages = 0;
      
      // 更新表格資料
      if (this.api) {
        this.api.setGridOption('rowData', []);
      }
    } finally {
      this.isLoading = false;
    }
  }

  // 構建查詢條件
  private buildFilterCondition(): any {
    const filter: any = {};
    
    // 承攬公司過濾
    if (this.selectedContractingCompany) {
      filter.contractingCompanyName = this.selectedContractingCompany;
    }
    
    // 證照類型過濾（這裡需要特殊處理，因為證照是陣列）
    if (this.selectedCertificationTypes.length > 0) {
      filter['certifications.type'] = { $in: this.selectedCertificationTypes };
    }
    
    return filter;
  }

  checkWorkerValidity(worker: WorkerWithFlag): WritableSignal<boolean> {
    // 使用已經存在的 signal
    const workerIsValid = worker.isValid;

    // 預設為有效
    workerIsValid.set(true);

    // 檢查意外險是否過期
    if (worker.accidentInsurances && worker.accidentInsurances.length > 0) {
      const allInsurancesValid = worker.accidentInsurances.every(
        (insurance: any) => {
          return dayjs().isBefore(dayjs(insurance.end));
        }
      );

      if (!allInsurancesValid) {
        workerIsValid.set(false);
      }
    }

    // 檢查證照是否過期
    if (worker.certifications && worker.certifications.length > 0) {
      // 設置每張證照的有效性
      worker.certifications.forEach((cert: CertificationWithFlag) => {
        cert.isValid = dayjs().isBefore(dayjs(cert.withdraw));
      });

      // 檢查是否有任何一個證照無效
      const hasInvalidCert = worker.certifications.some(
        (cert: CertificationWithFlag) => !cert.isValid
      );

      if (hasInvalidCert) {
        workerIsValid.set(false);
      }
    }

    return workerIsValid;
  }

  generateRandomWorker(index: number): WorkerWithFlag {
    const newWorker: WorkerWithFlag = {
      name: `Worker ${index + 1}`,
      gender: Math.random() > 0.5 ? '男' : '女',
      birthday: dayjs('1960-01-01')
        .add(Math.floor(Math.random() * 365 * 40), 'days')
        .format('YYYY-MM-DD'),
      bloodType: ['A', 'B', 'O', 'AB'][Math.floor(Math.random() * 4)],
      tel:
        '09' +
        Math.floor(Math.random() * 100000000)
          .toString()
          .padStart(8, '0'),
      liaison:
        '09' +
        Math.floor(Math.random() * 100000000)
          .toString()
          .padStart(8, '0'),
      emergencyTel:
        '09' +
        Math.floor(Math.random() * 100000000)
          .toString()
          .padStart(8, '0'),
      address: ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市'][
        Math.floor(Math.random() * 6)
      ],
      profilePicture: '',
      idCardFrontPicture: '',
      idCardBackPicture: '',
      // hazardNotifyDate: dayjs('2024-01-01')
      //   .add(Math.floor(Math.random() * 365), 'days')
      //   .format('YYYY-MM-DD'),
      supplierIndustrialSafetyNumber: '1234567890',
      generalSafetyTrainingDate: dayjs('2024-01-01')
        .add(Math.floor(Math.random() * 365), 'days')
        .format('YYYY-MM-DD'),
      generalSafetyTrainingDueDate: dayjs('2024-01-01')
        .add(Math.floor(Math.random() * 365), 'days')
        .format('YYYY-MM-DD'),
      laborInsuranceApplyDate: dayjs('2024-01-01')
        .add(Math.floor(Math.random() * 365), 'days')
        .format('YYYY-MM-DD'),
      laborInsurancePicture: '',
      laborAssociationDate: dayjs('2024-01-01')
        .add(Math.floor(Math.random() * 365), 'days')
        .format('YYYY-MM-DD'),
      sixHourTrainingDate: dayjs('2024-01-01')
        .add(Math.floor(Math.random() * 365), 'days')
        .format('YYYY-MM-DD'),
      sixHourTrainingFrontPicture: '',
      sixHourTrainingBackPicture: '',
      accidentInsurances: [],
      contractingCompanyName: '公司1',
      viceContractingCompanyName: '公司2',
      certifications: [],
      reviewStaff: '張三',
      idno: 'A' + Math.floor(Math.random() * 10000000000),
      no: null,
      medicalExamPictures: [],
      isValid: signal(true),
    };

    // 隨機生成一些證照
    if (Math.random() > 0.7) {
      const issueDate = dayjs('2022-01-01').add(
        Math.floor(Math.random() * 365),
        'days'
      );
      const withdrawDate = issueDate.add(
        Math.floor(Math.random() * 365 * 2),
        'days'
      );
      const certIsValid = dayjs().isBefore(withdrawDate);

      newWorker.certifications.push({
        type: CertificationType.A,
        name: '高空作業車操作人員',
        issue: issueDate.format('YYYY-MM-DD'),
        withdraw: withdrawDate.format('YYYY-MM-DD'),
        frontPicture: '',
        backPicture: '',
        isValid: certIsValid,
      });

      // 更新 worker 的整體有效性
      if (!certIsValid) {
        newWorker.isValid.set(false);
      }
    }

    return newWorker;
  }

  onGridReady(params: GridReadyEvent) {
    this.api = params.api;
    console.log('AG-Grid 初始化完成');
    
    // 設定初始分頁狀態
    if (this.totalPages > 1) {
      this.api.setGridOption('pagination', true);
      console.log('初始化時啟用分頁，總頁數:', this.totalPages);
    }
    
    if (this.filteredWorkers && this.filteredWorkers.length > 0) {
      this.api.setGridOption('rowData', this.filteredWorkers);
      console.log('設定初始資料，行數:', this.filteredWorkers.length);
    }
  }

  // 初始化過濾器選項
  async initializeFilterOptions() {
    try {
      // 獲取所有承攬公司（不分頁，使用 projection 優化）
      const companiesResult = await this.mongodbService.getArray('worker', {}, {
        projection: { contractingCompanyName: 1 },
        limit: 0 // 0 表示載入所有資料
      });

      let allWorkers: any[] = [];
      if (companiesResult && typeof companiesResult === 'object' && 'data' in companiesResult && 'pagination' in companiesResult) {
        allWorkers = companiesResult.data as any[];
      } else {
        allWorkers = Array.isArray(companiesResult) ? companiesResult : [];
      }

      // 收集所有承攬公司並統計人數
      const companyCountMap = new Map<string, number>();
      allWorkers.forEach(worker => {
        if (worker.contractingCompanyName) {
          const count = companyCountMap.get(worker.contractingCompanyName) || 0;
          companyCountMap.set(worker.contractingCompanyName, count + 1);
        }
      });
      
      // 轉換為陣列並排序
      this.contractingCompaniesWithCount = Array.from(companyCountMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // 保持原有的字串陣列格式以相容現有程式碼
      this.contractingCompanies = this.contractingCompaniesWithCount.map(item => item.name);
      
      // 初始化過濾後的清單
      this.filteredContractingCompanies = [...this.contractingCompaniesWithCount];

      // 獲取所有證照類型（不分頁，使用 projection 優化）
      const certsResult = await this.mongodbService.getArray('worker', {}, {
        projection: { 'certifications.type': 1 },
        limit: 0 // 0 表示載入所有資料
      });

      let allWorkersWithCerts: any[] = [];
      if (certsResult && typeof certsResult === 'object' && 'data' in certsResult && 'pagination' in certsResult) {
        allWorkersWithCerts = certsResult.data as any[];
      } else {
        allWorkersWithCerts = Array.isArray(certsResult) ? certsResult : [];
      }

      // 收集所有證照類型
      const certTypes = new Set<CertificationType>();
      allWorkersWithCerts.forEach(worker => {
        if (worker.certifications) {
          worker.certifications.forEach((cert: any) => {
            certTypes.add(cert.type);
          });
        }
      });

      // 使用 CertificationTypeManager 來獲取證照類型的名稱
      this.certificationTypes = Array.from(certTypes).map(type => ({
        value: type,
        label: CertificationTypeManager.getName(type)
      })).sort((a, b) => a.label.localeCompare(b.label));
    } catch (error) {
      console.error('初始化過濾器選項時發生錯誤:', error);
    }
  }

  // 應用過濾器（重新載入第一頁資料）
  applyFilters() {
    console.log('應用過濾器，重置分頁到第一頁');
    // 重置到第一頁
    this.currentPage = 1;
    // 重新載入資料
    this.loadWorkersData();
    
    // 同步 AG-Grid 分頁狀態
    if (this.api) {
      this.api.paginationGoToPage(0); // 轉換為 0-indexed
    }
  }

  // 清除所有過濾器
  clearFilters() {
    console.log('清除所有過濾器，重置分頁到第一頁');
    this.selectedContractingCompany = '';
    this.selectedCertificationTypes = [];
    // 清除 URL 參數
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true
    });
    // 重置到第一頁並重新載入資料
    this.currentPage = 1;
    this.loadWorkersData();
    
    // 同步 AG-Grid 分頁狀態
    if (this.api) {
      this.api.paginationGoToPage(0); // 轉換為 0-indexed
    }
  }

  // 承攬公司變更事件
  onContractingCompanyChange() {
    this.updateUrlWithFilters();
    this.applyFilters();
  }

  // 承攬公司搜尋處理
  onCompanySearchChange() {
    if (!this.companySearchText.trim()) {
      // 如果搜尋文字為空，顯示所有公司
      this.filteredContractingCompanies = [...this.contractingCompaniesWithCount];
    } else {
      // 根據搜尋文字過濾公司清單
      const searchText = this.companySearchText.toLowerCase().trim();
      this.filteredContractingCompanies = this.contractingCompaniesWithCount.filter(company =>
        company.name.toLowerCase().includes(searchText)
      );
    }
  }

  // 清除承攬公司搜尋
  clearCompanySearch() {
    this.companySearchText = '';
    this.filteredContractingCompanies = [...this.contractingCompaniesWithCount];
  }

  // 遷移意外險資料：將舊的 picture 欄位移到 pictures 陣列，並修正錯誤的資料分配
  private migrateAccidentInsuranceData(workers: WorkerWithFlag[]): WorkerWithFlag[] {
    let migrationCount = 0;
    let correctionCount = 0;
    
    for (const worker of workers) {
      if (worker.accidentInsurances && worker.accidentInsurances.length > 0) {
        // 先處理基本的 picture 到 pictures 遷移
        for (const accidentInsurance of worker.accidentInsurances) {
          // 檢查是否有舊的 picture 欄位且沒有 pictures 陣列
          if ((accidentInsurance as any).picture && !accidentInsurance.pictures) {
            // 將 picture 內容移到 pictures 陣列
            accidentInsurance.pictures = [(accidentInsurance as any).picture];
            // 保留 picture 欄位以確保向後相容，但標記為已遷移
            (accidentInsurance as any)._migrated = true;
            migrationCount++;
            console.log(`遷移工人 ${worker.name} 的意外險圖片資料`);
          }
        }
        
        // 修正錯誤的資料分配：如果第二筆或之後的保險沒有開始/結束日期但有圖片，應該移到第一筆
        if (worker.accidentInsurances.length > 1) {
          const firstInsurance = worker.accidentInsurances[0];
          
          for (let i = 1; i < worker.accidentInsurances.length; i++) {
            const currentInsurance = worker.accidentInsurances[i];
            
            // 檢查是否沒有開始/結束日期但有圖片（表示是錯誤分配的資料）
            const hasNoDates = (!currentInsurance.start || currentInsurance.start.trim() === '') && 
                              (!currentInsurance.end || currentInsurance.end.trim() === '');
            const hasPictures = (currentInsurance.pictures && currentInsurance.pictures.length > 0) || 
                               (currentInsurance as any).picture;
            
            if (hasNoDates && hasPictures) {
              // 將圖片移到第一筆保險
              if (!firstInsurance.pictures) {
                firstInsurance.pictures = [];
              }
              
              // 移動 pictures 陣列中的圖片
              if (currentInsurance.pictures && currentInsurance.pictures.length > 0) {
                firstInsurance.pictures.push(...currentInsurance.pictures);
                currentInsurance.pictures = [];
              }
              
              // 移動單一 picture 欄位的圖片
              if ((currentInsurance as any).picture) {
                if (!firstInsurance.pictures.includes((currentInsurance as any).picture)) {
                  firstInsurance.pictures.push((currentInsurance as any).picture);
                }
                (currentInsurance as any).picture = '';
              }
              
              // 如果第一筆保險沒有 picture 欄位，設定為第一張圖片
              if (!(firstInsurance as any).picture && firstInsurance.pictures.length > 0) {
                (firstInsurance as any).picture = firstInsurance.pictures[0];
              }
              
              correctionCount++;
              console.log(`修正工人 ${worker.name} 的意外險資料分配：將第 ${i + 1} 筆的圖片移到第 1 筆`);
            }
          }
        }
      }
    }
    
    if (migrationCount > 0) {
      console.log(`總共遷移了 ${migrationCount} 筆意外險圖片資料`);
    }
    
    if (correctionCount > 0) {
      console.log(`總共修正了 ${correctionCount} 筆錯誤的意外險資料分配`);
    }
    
    return workers;
  }

  // 證照類型變更事件（checkbox）
  onCertificationTypeChange(certType: string, isChecked: boolean) {
    if (isChecked) {
      if (!this.selectedCertificationTypes.includes(certType)) {
        this.selectedCertificationTypes.push(certType);
      }
    } else {
      const index = this.selectedCertificationTypes.indexOf(certType);
      if (index > -1) {
        this.selectedCertificationTypes.splice(index, 1);
      }
    }
    this.updateUrlWithFilters();
    this.applyFilters();
  }

  // 檢查證照類型是否被選中
  isCertificationTypeSelected(certType: string): boolean {
    return this.selectedCertificationTypes.includes(certType);
  }

  // 切換過濾器展開狀態
  toggleFilterExpansion() {
    this.isFilterExpanded = !this.isFilterExpanded;
  }

  // 獲取過濾器狀態摘要
  getFilterSummary(): string {
    const summaryParts: string[] = [];

    if (this.selectedContractingCompany) {
      summaryParts.push(`承攬公司: ${this.selectedContractingCompany}`);
    }

    if (this.selectedCertificationTypes.length > 0) {
      summaryParts.push(`證照: ${this.selectedCertificationTypes.length} 項`);
    }

    return summaryParts.length > 0 ? summaryParts.join(' | ') : '無篩選條件';
  }

  // 切換工人選中狀態
  toggleWorkerSelection(workerId: string) {
    if (this.selectedWorkerIds.has(workerId)) {
      this.selectedWorkerIds.delete(workerId);
    } else {
      this.selectedWorkerIds.add(workerId);
    }

    // 觸發行樣式的重新渲染
    if (this.api) {
      this.api.redrawRows();
    }
  }

  // 檢查是否有選中的工人
  hasSelectedWorkers(): boolean {
    return this.selectedWorkerIds.size > 0;
  }

  // 測試分頁功能
  testPagination(): void {
    console.log('=== 測試分頁功能 ===');
    console.log('當前分頁狀態:', {
      currentPage: this.currentPage,
      pageSize: this.pageSize,
      totalRecords: this.totalRecords,
      totalPages: this.totalPages
    });
    
    if (this.api) {
      console.log('AG-Grid 分頁狀態:', {
        currentPage: this.api.paginationGetCurrentPage(),
        pageSize: this.api.paginationGetPageSize(),
        totalPages: this.api.paginationGetTotalPages()
      });
      
      // 強制刷新分頁控制項
      if (this.api) {
        this.api.setGridOption('pagination', false);
        setTimeout(() => {
          if (this.api) {
            this.api.setGridOption('pagination', true);
            console.log('分頁控制項已強制刷新');
          }
        }, 100);
      }
      
      // 嘗試切換到第二頁
      if (this.totalPages > 1) {
        console.log('嘗試切換到第二頁');
        this.currentPage = 2;
        this.loadWorkersData();
      } else {
        console.log('沒有多頁資料，無法測試分頁');
      }
    } else {
      console.log('AG-Grid API 未初始化');
    }
  }

  // 手動切換到指定頁面
  goToPage(page: number): void {
    console.log('嘗試切換到第', page, '頁，當前狀態:', {
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      pageSize: this.pageSize,
      totalRecords: this.totalRecords
    });
    
    if (page < 1 || page > this.totalPages) {
      console.log('無效的頁碼:', page, '，有效範圍: 1 -', this.totalPages);
      return;
    }
    
    console.log('手動切換到第', page, '頁');
    this.currentPage = page;
    this.loadWorkersData();
    
    // 同步 AG-Grid 分頁狀態
    if (this.api) {
      const agGridPage = page - 1; // 轉換為 0-indexed
      this.api.paginationGoToPage(agGridPage);
      console.log('AG-Grid 分頁已同步到:', agGridPage);
    }
  }

  // 清除所有選中狀態
  clearSelection() {
    this.selectedWorkerIds.clear();
    // 刷新整個表格以更新顯示
    if (this.api) {
      // 刷新儲存格內容（移除綠色勾勾）
      this.api.refreshCells();
      // 重新計算行樣式（移除行背景色）
      this.api.redrawRows();
    }
  }

  // 獲取選中的工人數據
  getSelectedWorkers(): WorkerWithFlag[] {
    return this.filteredWorkers.filter(worker =>
      worker._id && this.selectedWorkerIds.has(worker._id)
    );
  }

  // 匯出選中的工人資料為 Excel（基本版）


  // 匯出帶浮水印的 Excel（簡潔版）
  async exportSelectedWorkersWithWatermark() {
    if (!this.hasSelectedWorkers()) {
      return;
    }

    const selectedWorkers = this.getSelectedWorkers();

    try {
      // 創建新的工作簿
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('工人資料');

      // 按照圖片順序設定標題行和顏色
      const headerConfigs = [
        // 基本資料欄位 - 藍綠色
        { title: '編號', color: '5B9BD5' },
        { title: '姓名', color: '5B9BD5' },
        { title: '性別', color: '5B9BD5' },
        { title: '生日', color: '5B9BD5' },
        { title: '年齡', color: '5B9BD5' },
        { title: '血型', color: '5B9BD5' },
        { title: '電話', color: '5B9BD5' },
        { title: '聯絡人', color: '5B9BD5' },
        { title: '緊急聯絡電話', color: '5B9BD5' },
        { title: '聯絡地址', color: '5B9BD5' },
        { title: '承攬公司', color: '5B9BD5' },
        { title: '次承攬公司', color: '5B9BD5' },
        { title: '身分證字號', color: '5B9BD5' },

        // 安全訓練相關 - 紅色
        { title: '供應商工安認證編號', color: 'C55A5A' },
        { title: '一般安全衛生教育訓練發證日期', color: 'C55A5A' },
        { title: '一般安全衛生教育訓練應回訓日期', color: 'C55A5A' },
        { title: '勞保申請日期', color: 'C55A5A' },
        { title: '勞工團體入會日期', color: 'C55A5A' },
        { title: '6小時期效狀況', color: 'C55A5A' },

        // 意外險相關 - 紫色
        { title: '意外險開始日期', color: '7030A0' },
        { title: '意外險結束日期', color: '7030A0' },
        { title: '意外險保額', color: '7030A0' },
        { title: '意外險簽約日期', color: '7030A0' },
        { title: '意外險公司', color: '7030A0' },

        // 審核相關 - 橘色
        { title: '審核人員', color: 'D99694' },
        { title: '證照數量', color: 'D99694' },

        // 證照欄位 - 按圖片中的順序和顏色
        { title: '高空作業車操作人員\r\n發證日期\r\n(A)', color: '92D050' },
        { title: '高空作業車操作人員\r\n回訓日期', color: '92D050' },

        { title: '乙級職業安全管理員\r\n發證日期\r\n(BOSH)', color: '00B050' },
        { title: '乙級職業安全管理員\r\n回訓日期(期效3年)', color: '00B050' },

        { title: '甲級職業安全管理師\r\n發證日期\r\n(AOS)', color: '00B0F0' },
        { title: '甲級職業安全管理師\r\n回訓日期(期效3年)', color: '00B0F0' },

        { title: '甲級職業衛生管理師\r\n發證日期\r\n(AOH)', color: '0070C0' },
        { title: '甲級職業衛生管理師\r\n回訓日期(期效3年)', color: '0070C0' },

        { title: '急救人員\r\n發證日期\r\n(FR)', color: '002060' },
        { title: '急救人員\r\n回訓日期(期效3年)', color: '002060' },

        { title: '缺氧(侷限)作業主管證照\r\n發證日期\r\n(O2)', color: 'FFFF00' },
        { title: '缺氧(侷限)作業主管證照\r\n回訓日期(期效3年)', color: 'FFFF00' },

        { title: '有機溶劑作業主管證照\r\n發證日期\r\n(OS)', color: '92D050' },
        { title: '有機溶劑作業主管證照\r\n回訓日期(期效3年)', color: '92D050' },

        { title: '施工架組配作業主管\r\n發證日期\r\n(SA)', color: 'C0C0C0' },
        { title: '施工架組配作業主管\r\n回訓日期(期效3年)', color: 'C0C0C0' },

        { title: '營造業職業安全衛生業務主管\r\n發證日期\r\n(S)', color: '305496' },
        { title: '營造業職業安全衛生業務主管\r\n回訓日期(期效2年)', color: '305496' },

        { title: '職業安全衛生業務主管證照名稱', color: 'FFFF00' },
        { title: '職業安全衛生業務主管\r\n發證日期', color: 'FFFF00' },
        { title: '職業安全衛生業務主管\r\n證照回訓日期(期效2年)', color: 'FFFF00' },

        // 其他證照繼續按順序...
        { title: '特定化學物質作業主管\r\n發證日期\r\n(SC)', color: 'A9D18E' },
        { title: '特定化學物質作業主管\r\n回訓日期(期效3年)', color: 'A9D18E' },

        { title: '粉塵作業主管\r\n發證日期\r\n(DW)', color: 'B4C6E7' },
        { title: '粉塵作業主管\r\n回訓日期(期效3年)', color: 'B4C6E7' },

        { title: '氧乙炔熔接裝置作業人員\r\n發證日期\r\n(OW)', color: 'D9E1F2' },
        { title: '氧乙炔熔接裝置作業人員\r\n回訓日期(期效3年)', color: 'D9E1F2' },

        { title: '屋頂作業主管\r\n發證日期\r\n(R)', color: 'E2EFDA' },
        { title: '屋頂作業主管\r\n回訓日期(期效3年)', color: 'E2EFDA' },

        { title: '鋼構組配作業主管\r\n發證日期\r\n(SSA)', color: 'FFF2CC' },
        { title: '鋼構組配作業主管\r\n回訓日期(期效3年)', color: 'FFF2CC' },

        { title: '模板支撐作業主管\r\n發證日期\r\n(FS)', color: 'FCE4D6' },
        { title: '模板支撐作業主管\r\n回訓日期(期效3年)', color: 'FCE4D6' },

        { title: '露天開挖作業主管\r\n發證日期\r\n(PE)', color: 'F8CBAD' },
        { title: '露天開挖作業主管\r\n回訓日期(期效3年)', color: 'F8CBAD' },

        { title: '擋土支撐作業主管\r\n發證日期\r\n(RS)', color: 'EDEDED' },
        { title: '擋土支撐作業主管\r\n回訓日期(期效3年)', color: 'EDEDED' }
      ];

      // 創建標題行
      const headers = headerConfigs.map(config => config.title);
      const headerRow = worksheet.addRow(headers);

      // 設定每個標題的顏色和格式
      headerRow.eachCell((cell, colNumber) => {
        const config = headerConfigs[colNumber - 1];
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: config.color }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = {
          wrapText: true,
          horizontal: 'center',
          vertical: 'middle'
        };
      });

      // 添加數據行
      selectedWorkers.forEach((worker, index) => {
        const age = worker.birthday ? dayjs().diff(worker.birthday, 'years') : '';

        // 取得最新的意外險資料
        const latestAccidentInsurance = worker.accidentInsurances && worker.accidentInsurances.length > 0
          ? worker.accidentInsurances[worker.accidentInsurances.length - 1]
          : null;

        // 按照新的欄位順序組織數據
        const getCertData = (certType: CertificationType) => {
          const cert = worker.certifications?.find(c => c.type === certType);
          return {
            issue: cert?.issue ? dayjs(cert.issue).format('YYYY-MM-DD') : '',
            withdraw: cert?.withdraw ? dayjs(cert.withdraw).format('YYYY-MM-DD') : ''
          };
        };

        // 獲取特殊的職業安全衛生業務主管證照名稱
        const getSpecialCertName = () => {
          const generalCert = worker.certifications?.find(c => c.type === CertificationType.MA);
          const constructionCert = worker.certifications?.find(c => c.type === CertificationType.S);

          if (generalCert) return generalCert.name || '一般業職業安全衛生業務主管';
          if (constructionCert) return constructionCert.name || '營造業職業安全衛生業務主管';
          return '';
        };

        const getSpecialCertIssue = () => {
          const generalCert = worker.certifications?.find(c => c.type === CertificationType.MA);
          const constructionCert = worker.certifications?.find(c => c.type === CertificationType.S);

          if (generalCert && generalCert.issue) return dayjs(generalCert.issue).format('YYYY-MM-DD');
          if (constructionCert && constructionCert.issue) return dayjs(constructionCert.issue).format('YYYY-MM-DD');
          return '';
        };

        const getSpecialCertWithdraw = () => {
          const generalCert = worker.certifications?.find(c => c.type === CertificationType.MA);
          const constructionCert = worker.certifications?.find(c => c.type === CertificationType.S);

          if (generalCert && generalCert.withdraw) return dayjs(generalCert.withdraw).format('YYYY-MM-DD');
          if (constructionCert && constructionCert.withdraw) return dayjs(constructionCert.withdraw).format('YYYY-MM-DD');
          return '';
        };

        // 按照headerConfigs的順序組織資料
        const rowData = [
          // 基本資料
          worker.no || (index + 1), // 編號
          worker.name || '',
          worker.gender || '',
          worker.birthday || '',
          age || '',
          worker.bloodType || '',
          worker.tel || '',
          worker.liaison || '',
          worker.emergencyTel || '',
          worker.address || '',
          worker.contractingCompanyName || '',
          worker.viceContractingCompanyName || '',
          worker.idno || '',

          // 安全訓練相關
          worker.supplierIndustrialSafetyNumber || '',
          worker.generalSafetyTrainingDate || '',
          worker.generalSafetyTrainingDueDate || '',
          worker.laborInsuranceApplyDate || '',
          worker.laborAssociationDate || '',
          worker.sixHourTrainingDate || '',

          // 意外險相關
          latestAccidentInsurance?.start || '',
          latestAccidentInsurance?.end || '',
          latestAccidentInsurance?.amount || '',
          latestAccidentInsurance?.signDate || '',
          latestAccidentInsurance?.companyName || '',

          // 審核相關
          worker.reviewStaff || '',
          worker.certifications?.length || 0,

          // 證照欄位 - 按照圖片順序
          getCertData(CertificationType.A).issue,    // 高空作業車發證日期
          getCertData(CertificationType.A).withdraw, // 高空作業車回訓日期

          getCertData(CertificationType.BOSH).issue,    // 乙級職業安全管理員發證日期
          getCertData(CertificationType.BOSH).withdraw, // 乙級職業安全管理員回訓日期

          getCertData(CertificationType.AOS).issue,    // 甲級職業安全管理師發證日期
          getCertData(CertificationType.AOS).withdraw, // 甲級職業安全管理師回訓日期

          getCertData(CertificationType.AOH).issue,    // 甲級職業衛生管理師發證日期
          getCertData(CertificationType.AOH).withdraw, // 甲級職業衛生管理師回訓日期

          getCertData(CertificationType.FR).issue,    // 急救人員發證日期
          getCertData(CertificationType.FR).withdraw, // 急救人員回訓日期

          getCertData(CertificationType.O2).issue,    // 缺氧作業主管發證日期
          getCertData(CertificationType.O2).withdraw, // 缺氧作業主管回訓日期

          getCertData(CertificationType.OS).issue,    // 有機溶劑作業主管發證日期
          getCertData(CertificationType.OS).withdraw, // 有機溶劑作業主管回訓日期

          getCertData(CertificationType.SA).issue,    // 施工架組配作業主管發證日期
          getCertData(CertificationType.SA).withdraw, // 施工架組配作業主管回訓日期

          getCertData(CertificationType.S).issue,    // 營造業職業安全衛生業務主管發證日期
          getCertData(CertificationType.S).withdraw, // 營造業職業安全衛生業務主管回訓日期

          // 特殊的職業安全衛生業務主管3欄位
          getSpecialCertName(),     // 證照名稱
          getSpecialCertIssue(),    // 發證日期
          getSpecialCertWithdraw(), // 回訓日期

          // 其他證照繼續
          getCertData(CertificationType.SC).issue,    // 特定化學物質作業主管發證日期
          getCertData(CertificationType.SC).withdraw, // 特定化學物質作業主管回訓日期

          getCertData(CertificationType.DW).issue,    // 粉塵作業主管發證日期
          getCertData(CertificationType.DW).withdraw, // 粉塵作業主管回訓日期

          getCertData(CertificationType.OW).issue,    // 氧乙炔熔接裝置作業人員發證日期
          getCertData(CertificationType.OW).withdraw, // 氧乙炔熔接裝置作業人員回訓日期

          getCertData(CertificationType.R).issue,    // 屋頂作業主管發證日期
          getCertData(CertificationType.R).withdraw, // 屋頂作業主管回訓日期

          getCertData(CertificationType.SSA).issue,    // 鋼構組配作業主管發證日期
          getCertData(CertificationType.SSA).withdraw, // 鋼構組配作業主管回訓日期

          getCertData(CertificationType.FS).issue,    // 模板支撐作業主管發證日期
          getCertData(CertificationType.FS).withdraw, // 模板支撐作業主管回訓日期

          getCertData(CertificationType.PE).issue,    // 露天開挖作業主管發證日期
          getCertData(CertificationType.PE).withdraw, // 露天開挖作業主管回訓日期

          getCertData(CertificationType.RS).issue,    // 擋土支撐作業主管發證日期
          getCertData(CertificationType.RS).withdraw  // 擋土支撐作業主管回訓日期
        ];
        const dataRow = worksheet.addRow(rowData);

        // 為數據行添加邊框
        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // 設定列寬 - 按照新的欄位順序
      const columnWidths = [
        // 基本資料欄位
        8,   // 編號
        12,  // 姓名
        8,   // 性別
        12,  // 生日
        8,   // 年齡
        8,   // 血型
        15,  // 電話
        12,  // 聯絡人
        15,  // 緊急聯絡電話
        25,  // 聯絡地址
        15,  // 承攬公司
        15,  // 次承攬公司
        15,  // 身分證字號

        // 安全訓練相關
        20,  // 供應商工安認證編號
        25,  // 一般安全衛生教育訓練發證日期
        25,  // 一般安全衛生教育訓練應回訓日期
        15,  // 勞保申請日期
        15,  // 勞工團體入會日期
        15,  // 6小時期效狀況

        // 意外險相關
        15,  // 意外險開始日期
        15,  // 意外險結束日期
        12,  // 意外險保額
        15,  // 意外險簽約日期
        15,  // 意外險公司

        // 審核相關
        12,  // 審核人員
        10,  // 證照數量

        // 證照欄位 - 每個證照都有發證日期和回訓日期兩欄
        20, 20,  // 高空作業車操作人員
        20, 20,  // 乙級職業安全管理員
        20, 20,  // 甲級職業安全管理師
        20, 20,  // 甲級職業衛生管理師
        20, 20,  // 急救人員
        20, 20,  // 缺氧作業主管
        20, 20,  // 有機溶劑作業主管
        20, 20,  // 施工架組配作業主管
        20, 20,  // 營造業職業安全衛生業務主管
        25, 20, 20,  // 職業安全衛生業務主管（3欄位：名稱、發證、回訓）
        20, 20,  // 特定化學物質作業主管
        20, 20,  // 粉塵作業主管
        20, 20,  // 氧乙炔熔接裝置作業人員
        20, 20,  // 屋頂作業主管
        20, 20,  // 鋼構組配作業主管
        20, 20,  // 模板支撐作業主管
        20, 20,  // 露天開挖作業主管
        20, 20   // 擋土支撐作業主管
      ];

      worksheet.columns = columnWidths.map(width => ({ width }));

      // 添加浮水印效果
      await this.addAdvancedWatermark(worksheet, selectedWorkers.length);

      // 設定工作表保護（可選）
      await worksheet.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        insertColumns: false,
        deleteRows: false,
        deleteColumns: false
      });

      // 匯出檔案
      const currentDate = dayjs().format('YYYY-MM-DD');
      const fileName = `工人資料_${currentDate}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // 創建下載鏈接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();

      // 清理
      window.URL.revokeObjectURL(url);

      // 匯出完成

    } catch (error) {
      console.error('匯出Excel時發生錯誤:', error);
      alert('匯出失敗，請檢查控制台錯誤訊息');
    }
  }

  // 高級背景浮水印方法
  private async addAdvancedWatermark(worksheet: ExcelJS.Worksheet, rowCount: number) {
    const currentDate = dayjs().format('YYYY-MM-DD HH:mm');
    const userName = localStorage.getItem('username') || '管理員';

    try {
      // 創建浮水印圖片 (使用 Canvas 生成背景圖)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // 設定 canvas 大小 (足夠覆蓋整個工作表)
        canvas.width = 1200;
        canvas.height = 800;

        // 設定背景透明
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 設定文字樣式
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = 'rgba(128, 128, 128, 0.08)'; // 非常淺的灰色，幾乎透明
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 在整個背景上重複繪製浮水印
        const watermarkText1 = '帆宣工安系統';
        const watermarkText2 = `${userName}`;
        const watermarkText3 = currentDate.split(' ')[0]; // 只顯示日期部分

        // 計算間距
        const spacingX = 300;
        const spacingY = 200;

        for (let x = 150; x < canvas.width; x += spacingX) {
          for (let y = 100; y < canvas.height; y += spacingY) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-Math.PI / 6); // 旋轉 -30 度

            // 繪製多行浮水印文字
            ctx.fillText(watermarkText1, 0, -20);
            ctx.fillText(watermarkText2, 0, 10);
            ctx.fillText(watermarkText3, 0, 40);

            ctx.restore();
          }
        }

        // 將 canvas 轉換為 base64
        const imageData = canvas.toDataURL('image/png');
        const base64Data = imageData.split(',')[1];

        // 添加圖片到工作簿
        const workbook = worksheet.workbook;
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        });

        // 設定為背景圖片
        worksheet.addBackgroundImage(imageId);

        console.log('成功添加背景浮水印');
      }
    } catch (error) {
      console.warn('添加背景浮水印失敗，使用備用方案:', error);

      // 備用方案：在頁首和頁尾添加信息
      try {
        // 在第一行添加匯出信息
        const headerRow = worksheet.insertRow(1, []);
        const headerCell = headerRow.getCell(1);
        headerCell.value = `匯出時間: ${currentDate} | 匯出者: ${userName} | CSIS 系統`;
        headerCell.font = {
          size: 10,
          color: { argb: '808080' },
          italic: true
        };
        headerCell.alignment = { horizontal: 'center' };

        // 合併第一行的儲存格（擴展到所有欄位）
        // 總共有27個基本欄位 + 41個證照欄位 = 68欄
        worksheet.mergeCells(1, 1, 1, 68);

        // 在頁尾添加保護信息
        const footerRow = worksheet.addRow([]);
        const footerCell = footerRow.getCell(1);
        footerCell.value = `⚠️ 機密資料 | 共 ${rowCount} 筆 | 請勿外流 | ${currentDate}`;
        footerCell.font = {
          size: 9,
          color: { argb: 'FF6B6B' },
          bold: true
        };
        footerCell.alignment = { horizontal: 'center' };

        // 合併頁尾儲存格（擴展到所有欄位）
        worksheet.mergeCells(footerRow.number, 1, footerRow.number, 68);

      } catch (backupError) {
        console.error('備用浮水印方案也失敗:', backupError);
      }
    }
  }



  // 處理檔案選擇
  onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) {
      return;
    }

    const file = target.files[0];
    this.processZipFile(file);
  }

  // 處理拖放事件
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    // 可以添加視覺效果，例如改變drop-zone的樣式
    const dropZone = event.currentTarget as HTMLElement;
    if (dropZone) {
      dropZone.classList.add('drag-over');
    }
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const dropZone = event.currentTarget as HTMLElement;
    if (dropZone) {
      dropZone.classList.remove('drag-over');
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const dropZone = event.currentTarget as HTMLElement;
    if (dropZone) {
      dropZone.classList.remove('drag-over');
    }

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        this.processZipFile(file);
      } else {
        this.showError('請上傳ZIP檔案');
      }
    }
  }

  // 處理ZIP檔案
  async processZipFile(file: File) {
    if (file.type !== 'application/zip' && !file.name.endsWith('.zip')) {
      this.showError('請上傳ZIP檔案');
      return;
    }

    this.resetImportState();
    this.isProcessing = true;
    this.processStatus = '正在解析ZIP檔案...';
    this.processProgress = 10;

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file, {
        decodeFileName: (bytes: Uint8Array | string[]) => {
          // 確保 bytes 是 Uint8Array 類型
          let uint8Array: Uint8Array;
          
          if (Array.isArray(bytes)) {
            // 如果是字符串陣列，轉換為 Uint8Array
            uint8Array = new Uint8Array(bytes.map(char => char.charCodeAt(0)));
          } else {
            // 在瀏覽器環境中，bytes 應該是 Uint8Array 類型
            uint8Array = bytes as Uint8Array;
          }
          
          // 嘗試多種編碼方式來正確解碼中文檔名
          const encodings = ['utf-8', 'big5', 'gb2312'];
          
          for (const encoding of encodings) {
            try {
              // 使用 TextDecoder 嘗試解碼
              const decoder = new TextDecoder(encoding);
              const decoded = decoder.decode(uint8Array);
              
              // 檢查解碼結果是否包含亂碼字符
              if (!/[\uFFFD]/.test(decoded)) {
                return decoded;
              }
            } catch (e) {
              // 如果解碼失敗，繼續嘗試下一個編碼
              continue;
            }
          }
          
          // 如果所有編碼都失敗，使用預設的 UTF-8
          try {
            return new TextDecoder('utf-8').decode(uint8Array);
          } catch (e) {
            // 最後的備用方案：將 bytes 轉換為字符串
            return String.fromCharCode.apply(null, Array.from(uint8Array));
          }
        }
      });

      // 檢查"人員入場資料"目錄
      const personDirPath = Object.keys(zipContent.files).find(
        (path) => path.startsWith('人員入場資料/') || path === '人員入場資料/'
      );

      if (!personDirPath) {
        this.showError('ZIP檔案中找不到"人員入場資料"目錄，請確認檔案結構正確');
        return;
      }

      this.processStatus = '正在尋找人員入場資料Excel檔案...';
      this.processProgress = 30;

      // 檢查Excel檔案（支援多種可能的檔名）
      const possibleFileNames = [
        '人員入場資料.xlsx',
        '人員入場資料.xls',
        '人員入場清單.xlsx',
        '人員入場清單.xls',
        '人員清單.xlsx',
        '人員清單.xls',
        '人員資料.xlsx',
        '人員資料.xls',
      ];

      let excelFilePath = null;
      for (const fileName of possibleFileNames) {
        const foundPath = Object.keys(zipContent.files).find(
          (path) =>
            path.includes(`人員入場資料/${fileName}`) || path.endsWith(fileName)
        );

        if (foundPath) {
          excelFilePath = foundPath;
          break;
        }
      }

      if (!excelFilePath) {
        this.showError(`在"人員入場資料"目錄中找不到Excel檔案。
          請確認檔案名稱為：人員入場資料.xlsx 或 人員入場清單.xlsx 等。
          您可以參考系統提供的範例檔案: assets/人員入場清單.xlsx`);
        return;
      }

      this.processStatus = '正在讀取Excel檔案內容...';
      this.processProgress = 50;

      // 讀取Excel檔案
      const excelData = await zipContent.files[excelFilePath].async(
        'arraybuffer'
      );
      const workbook = XLSX.read(excelData, { type: 'array' });

      // 假設第一個工作表包含數據
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 將工作表轉換為JSON，並處理表頭的換行符號問題
      // 先獲取原始的表頭，處理換行符號
      const range = XLSX.utils.decode_range(worksheet['!ref'] || '');
      const headers: { [key: string]: string } = {};
      
      // 讀取第一行作為表頭，並處理換行符號
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          const originalHeader = String(cell.v);
          // 移除換行符號並清理空白字元
          const cleanedHeader = originalHeader.replace(/[\r\n]/g, '').trim();
          headers[cellAddress] = cleanedHeader;
          // 更新工作表中的表頭
          worksheet[cellAddress].v = cleanedHeader;
        }
        // w 欄位也要
        if (cell && cell.w) {
          const originalHeader = String(cell.w);
          const cleanedHeader = originalHeader.replace(/[\r\n]/g, '').trim();
          headers[cellAddress] = cleanedHeader;
          worksheet[cellAddress].w = cleanedHeader;
        }
      }
      
      console.log('清理後的表頭：', Object.values(headers));
      
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      this.processStatus = '正在檢查承攬公司欄位...';
      this.processProgress = 75;

      // 檢查每筆資料是否具備承攬公司欄位
      if (jsonData.length === 0) {
        this.showError('Excel檔案中沒有資料，請確認檔案內容');
        return;
      }

      // 記錄實際使用的欄位名稱，方便除錯
      const sampleKeys = Object.keys(jsonData[0]).slice(0, 10).join(', ');
      console.log('Excel欄位名稱樣本（已清理換行符號）：', sampleKeys);

      // 檢查錯誤
      const missingContractingCompany: string[] = [];
      const invalidDateFormat: string[] = [];
      const validWorkers: Worker[] = [];

      // 尋找可能的生日欄位名稱
      const possibleBirthdayFields = [
        '生日',
        '出生日期',
        '生日日期',
        '出生年月日',
        'birthday',
        'dob',
      ];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const errorInfo = { row: i + 2, data: row }; // 第一行為標題，所以+2

        // 檢查是否有承攬公司欄位
        const contractingCompanyField = this.findContractingCompanyField(row);
        console.log(row);

        if (!contractingCompanyField || !row[contractingCompanyField]) {
          missingContractingCompany.push(
            `第 ${i + 2} 行： ${JSON.stringify(row)}`
          );
          continue; // 如果沒有承攬公司欄位，則跳過後續檢查
        }

        // 檢查生日格式
        let hasBirthdayField = false;
        let birthdayValue = null;

        // 尋找生日欄位
        for (const field of possibleBirthdayFields) {
          if (field in row && row[field]) {
            hasBirthdayField = true;
            birthdayValue = row[field];
            break;
          }
        }

        // 如果有生日欄位，檢查格式
        if (hasBirthdayField && birthdayValue) {
          // 檢查日期格式是否符合YYYY/MM/DD或YYYY-MM-DD
          const dateFormatRegex =
            /^(19|20)\d\d[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])$/;

          // 如果是數字（Excel序列號），則先轉換為日期字符串
          let dateStr = birthdayValue;
          if (typeof birthdayValue === 'number') {
            const excelEpoch = new Date(1899, 11, 30);
            const millisecondsPerDay = 24 * 60 * 60 * 1000;
            const date = new Date(
              excelEpoch.getTime() + birthdayValue * millisecondsPerDay
            );
            dateStr = dayjs(date).format('YYYY-MM-DD');
          }

          // 檢查日期字符串是否符合格式
          if (!dateFormatRegex.test(dateStr) && !dayjs(dateStr).isValid()) {
            invalidDateFormat.push(`第 ${i + 2} 行： ${JSON.stringify(row)}`);
            continue; // 日期格式不正確，跳過這筆資料
          }
        }

        // 將資料轉換為Worker物件
        const worker = this.convertToWorker(row, contractingCompanyField);

        // 更新處理狀態
        this.processStatus = `正在處理第 ${i + 1}/${jsonData.length
          } 筆人員資料...`;
        this.processProgress = 50 + Math.floor((i / jsonData.length) * 40); // 50%-90%

        validWorkers.push(worker);
      }

      this.processStatus = '處理完成';
      this.processProgress = 100;

      // 儲存 ZIP 內容以便後續處理圖片
      this.zipContent = zipContent;

      // 顯示結果
      if (
        missingContractingCompany.length > 0 ||
        invalidDateFormat.length > 0
      ) {
        // 合併錯誤
        const allErrors = [...missingContractingCompany, ...invalidDateFormat];

        // 格式化錯誤資訊，僅顯示行號、姓名和身分證
        const formattedErrors = allErrors.map((errorStr, index) => {
          const rowMatch = errorStr.match(/第\s*(\d+)\s*行/);
          const rowNum = rowMatch ? rowMatch[1] : `行 ${index + 1}`;

          // 嘗試從JSON中提取姓名和身分證號
          let name = '未知';
          let idno = '未知';
          let errorType = '';

          try {
            // 從錯誤字符串中提取JSON部分
            const jsonStr = errorStr.substring(errorStr.indexOf('{'));
            const rowData = JSON.parse(jsonStr);

            // 決定錯誤類型
            if (missingContractingCompany.includes(errorStr)) {
              errorType = '缺少承攬公司';
            } else {
              errorType = '生日格式錯誤';
            }

            // 嘗試獲取姓名（考慮可能的不同欄位名稱）
            if (rowData['姓名']) {
              name = rowData['姓名'];
            } else if (rowData['員工姓名']) {
              name = rowData['員工姓名'];
            } else if (rowData['名字']) {
              name = rowData['名字'];
            }

            // 嘗試獲取身分證號（考慮可能的不同欄位名稱）
            if (rowData['身分證字號']) {
              idno = rowData['身分證字號'];
            } else if (rowData['身分證']) {
              idno = rowData['身分證'];
            } else if (rowData['身份證號碼']) {
              idno = rowData['身份證號碼'];
            } else if (rowData['個人ID']) {
              idno = rowData['個人ID'];
            }
          } catch (e) {
            console.error('解析錯誤行資料失敗:', e);
          }

          return { row: rowNum, name, idno, errorType };
        });

        const maxDisplayErrors = 10; // 最多顯示10筆錯誤
        const moreErrorsCount =
          formattedErrors.length > maxDisplayErrors
            ? formattedErrors.length - maxDisplayErrors
            : 0;

        let errorMessage = '';
        if (
          missingContractingCompany.length > 0 &&
          invalidDateFormat.length > 0
        ) {
          errorMessage = `有 ${missingContractingCompany.length} 筆資料缺少承攬公司欄位，${invalidDateFormat.length} 筆資料的生日格式不正確`;
        } else if (missingContractingCompany.length > 0) {
          errorMessage = `有 ${missingContractingCompany.length} 筆資料缺少承攬公司欄位`;
        } else {
          errorMessage = `有 ${invalidDateFormat.length} 筆資料的生日格式不正確`;
        }

        this.importResult = {
          success: false,
          message: errorMessage,
          details: ['請確認Excel檔案中的資料格式是否正確'],
          formattedErrors: formattedErrors.slice(0, maxDisplayErrors),
          moreErrors: moreErrorsCount,
        };

        // 添加參考範例檔案的訊息
        this.importResult.details?.push(
          '生日欄位應符合YYYY/MM/DD或YYYY-MM-DD格式'
        );
        this.importResult.details?.push(
          '您可以參考系統提供的範例檔案: assets/人員入場清單.xlsx'
        );
      } else if (validWorkers.length > 0) {
        // 對匯入資料進行去重處理，以身份證號+承攬公司為唯一鍵
        const uniqueWorkers = this.deduplicateWorkers(validWorkers);
        const duplicateCount = validWorkers.length - uniqueWorkers.length;

        // 檢查 ZIP 中的圖片檔案數量（不載入，只計算）
        const imageStats = await this.analyzeImagesInZip(
          uniqueWorkers,
          zipContent
        );

        this.importResult = {
          success: true,
          message: `成功解析 ${validWorkers.length} 筆人員資料${duplicateCount > 0 ? `（移除 ${duplicateCount} 筆重複資料）` : ''}${imageStats.totalImages > 0
            ? `，發現 ${imageStats.totalImages} 張圖片`
            : ''
            }，可以進行匯入`,
          details: [
            `總共 ${validWorkers.length} 筆資料${duplicateCount > 0 ? `，移除 ${duplicateCount} 筆重複資料` : ''}`,
            `實際匯入 ${uniqueWorkers.length} 筆資料`,
            ...(duplicateCount > 0 ? [`重複資料已自動移除（以身份證號+承攬公司為唯一識別）`] : []),
            ...(imageStats.totalImages > 0
              ? [
                `發現 ${imageStats.totalImages} 張圖片檔案`,
                `包含：大頭照 ${imageStats.profilePictures} 張、身份證 ${imageStats.idCards} 張、其他證照 ${imageStats.otherDocs} 張`,
              ]
              : ['未發現相關圖片檔案']),
            '圖片檔名格式：{身份證號}_{姓名}_{代碼}.jpg/jpeg/png',
            '支援的圖片代碼：IDF(身份證正面)、IDR(身份證反面)、P(大頭照)、L(勞保證明)、6F(六小時證明正面)、6R(六小時證明反面)、H/H1/H2/H3(體檢報告)、G1/G2/G3(意外險證明)、證照圖片({證照代碼}F/{證照代碼}R)',
            '證照代碼範例：AF/AR(高空作業車操作人員)、BOSHF/BOSHR(乙級職業安全管理員)、AOHF/AOHR(甲級職業衛生管理師)等',
            '點擊「匯入並刷新」開始匯入資料和上傳圖片',
          ],
        };

        // 儲存有效的工作人員資料，以便稍後匯入
        this.validWorkersToImport = uniqueWorkers;
      } else {
        this.importResult = {
          success: false,
          message: '沒有有效的人員資料可匯入',
          details: ['您可以參考系統提供的範例檔案: assets/人員入場清單.xlsx'],
        };
      }
    } catch (error) {
      console.error('處理ZIP檔案時發生錯誤', error);
      this.showError(
        `處理檔案時發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'
        }`
      );
    } finally {
      this.isProcessing = false;
    }
  }

  // 對工作人員資料進行去重處理
  deduplicateWorkers(workers: Worker[]): Worker[] {
    const uniqueMap = new Map<string, Worker>();
    
    for (const worker of workers) {
      if (worker.idno && worker.contractingCompanyName) {
        // 使用身份證號+承攬公司作為唯一鍵
        const key = `${worker.idno}_${worker.contractingCompanyName}`;
        
        // 如果已存在相同的鍵，保留最後一筆資料（或可以根據需求調整策略）
        uniqueMap.set(key, worker);
      }
    }
    
    return Array.from(uniqueMap.values());
  }

  // 找出承攬公司欄位（根據實際Excel檔案格式調整）
  findContractingCompanyField(row: any): string | null {
    // 可能的欄位名稱（根據範例檔案新增更多可能的名稱）
    const possibleFieldNames = [
      '承攬公司',
      '承包公司',
      '承攬廠商',
      '承包廠商',
      '承商公司',
      '承攬商',
    ];

    for (const key in row) {
      if (possibleFieldNames.includes(key.trim())) {
        return key;
      }
    }

    return null;
  }

  // 將Excel資料轉換為Worker物件
  convertToWorker(
    row: Record<string, any>,
    contractingCompanyField: string
  ): Worker {
    // 檢查多種可能的欄位名稱
    const getFieldValue = (possibleNames: string[]): string | number => {
      for (const name of possibleNames) {
        for (const key in row) {
          if (key.startsWith(name)) {
            if (typeof row[key] === 'string') {
              return row[key].toString().trim();
            } else if (typeof row[key] === 'number') {
              return row[key];
            }
          }
        }
      }
      return '';
    };

    // 處理意外險資料
    const accidentInsurances: {
      start: string;
      end: string;
      amount: string;
      signDate: string;
      companyName: string;
    }[] = [];

    // 檢查三組意外險資料
    for (let i = 1; i <= 3; i++) {
      const start = this.formatDate(
        getFieldValue([`意外險有效期${i}(起始日)`])
      );
      const end = this.formatDate(
        getFieldValue([`意外險有效期${i}(截止日)`])
      );
      const amount = getFieldValue([`保險金額${i}`]).toString();
      const signDate = this.formatDate(getFieldValue([`加保日期${i}`]));
      const companyName = getFieldValue([`保險公司${i}`]).toString();

      // 只有當至少有開始日期時才加入資料
      if (start) {
        accidentInsurances.push({
          start,
          end,
          amount,
          signDate,
          companyName,
        });
      }
    }

    // 處理證照資訊
    const certifications: Certification[] = [];
    const certificationMap = CertificationTypeManager.getCertificationMap();

    // 取得所有證照類型資訊
    const allCertTypes = CertificationTypeManager.getAllCertificationInfo();

    // 遍歷每種證照類型
    allCertTypes.forEach(certInfo => {
      const certType = CertificationTypeManager.getTypeByCode(certInfo.code);
      if (!certType) return;

      // 通用方法：搜尋包含該證照名稱的欄位
      let issueDate = '';
      let withdrawDate = '';
      let hasCertification = false;
      let actualCertName = certInfo.name; // 預設使用標準名稱

      // 遍歷所有 Excel 欄位，尋找包含證照名稱的欄位
      Object.keys(row).forEach(fieldName => {
        const fieldValue = row[fieldName];

        // 檢查欄位名稱是否包含證照名稱
        const containsCertName = fieldName.includes(certInfo.name) ||
          fieldName.includes(certInfo.fullLabel) ||
          fieldName.includes(`(${certInfo.code})`) ||
          fieldName.includes(`(${certInfo.code.toUpperCase()})`);

        // 特別處理「職業安全衛生業務主管證照」的3欄位格式
        const isSpecialCertName = fieldName.includes('職業安全衛生業務主管證照名稱') ||
          fieldName.includes('職業安全衛生業務主管') && fieldName.includes('證照名稱');

        if ((containsCertName && fieldValue) || isSpecialCertName) {

          // 如果是證照名稱欄位，檢查其值是否對應到某個證照類型
          if (isSpecialCertName && fieldValue) {
            // 根據證照名稱欄位的值來判斷是哪種證照類型
            const certNameValue = fieldValue.toString().trim();

            // 檢查證照名稱值是否匹配當前證照類型
            if (certNameValue.includes(certInfo.name) ||
              certNameValue.includes(certInfo.fullLabel) ||
              certNameValue.includes(certInfo.code)) {
              hasCertification = true;
              actualCertName = certNameValue; // 使用Excel中的實際證照名稱
            }
          } else if (containsCertName) {
            hasCertification = true;
          }

          // 檢查是否為發證日期欄位
          const isIssueField = fieldName.includes('發證日期') ||
            fieldName.includes('發證') ||
            fieldName.includes('核發日期');

          // 檢查是否為回訓日期欄位
          const isWithdrawField = fieldName.includes('回訓日期') ||
            fieldName.includes('有效期') ||
            fieldName.includes('證照回訓日期');

          if (isIssueField && !issueDate) {
            issueDate = this.formatDate(fieldValue);
          }

          if (isWithdrawField && !withdrawDate) {
            withdrawDate = this.formatDate(fieldValue);
          }

          // 如果欄位既不是發證也不是回訓，但有值，可能就是發證日期
          if (!isIssueField && !isWithdrawField && !isSpecialCertName && !issueDate) {
            const formattedDate = this.formatDate(fieldValue);
            if (formattedDate) {
              issueDate = formattedDate;
            }
          }
        }
      });

      // 如果找到相關證照資訊，則添加到證照陣列
      if (hasCertification || issueDate || withdrawDate) {
        certifications.push({
          type: certType,
          name: actualCertName, // 使用實際的證照名稱
          issue: issueDate,
          withdraw: withdrawDate,
          frontPicture: '',
          backPicture: '',
        });

        console.log(`發現證照：${actualCertName} - 發證日期: ${issueDate}, 回訓日期: ${withdrawDate}`);
      }
    });

    return {
      name: getFieldValue(['姓名', '員工姓名', '名字']) as string,
      gender: getFieldValue(['性別', '員工性別']) as string,
      birthday: this.formatDate(getFieldValue(['生日', '出生日期'])) as string,
      bloodType: getFieldValue(['血型']) as string,
      tel: getFieldValue([
        '聯絡電話',
        '電話號碼',
        '手機',
        '連絡電話',
      ]) as string,
      liaison: getFieldValue(['聯絡人', '緊急聯絡人', '家屬聯絡人']) as string,
      emergencyTel: getFieldValue(['緊急聯絡電話', '緊急電話']) as string,
      address: getFieldValue(['聯絡地址', '居住地址', '地址']) as string,
      profilePicture: '',
      idCardFrontPicture: '',
      idCardBackPicture: '',
      // hazardNotifyDate: this.formatDate(
      //   getFieldValue(['危害告知日期', '危害告知'])
      // ) as string,
      supplierIndustrialSafetyNumber: getFieldValue([
        '供應商工安認證編號',
        '工安認證編號',
      ]) as string,
      generalSafetyTrainingDate: this.formatDate(
        getFieldValue([
          '一般安全衛生教育訓練(6小時)\r\n發證/回訓日期',
          '一般安全衛生教育訓練(6小時)\r\n發證日期',
          '一般安全衛生教育訓練(6小時)\r\n回訓日期',
        ])
      ),
      generalSafetyTrainingDueDate: this.formatDate(
        getFieldValue(['一般安全衛生教育訓練(6小時)\r\n應回訓'])
      ),
      laborInsuranceApplyDate: this.formatDate(
        getFieldValue(['勞保申請日期', '勞保日期', '勞保申請'])
      ),
      laborInsurancePicture: '',
      laborAssociationDate: this.formatDate(
        getFieldValue([
          '勞工團體入會日期',
          '勞工團體',
          '團體入會日期',
          '工會申請日期',
        ])
      ),
      sixHourTrainingDate: this.formatDate(getFieldValue(['6小時期效狀況'])),
      sixHourTrainingFrontPicture: '',
      sixHourTrainingBackPicture: '',
      accidentInsurances: accidentInsurances,
      contractingCompanyName: row[contractingCompanyField],
      viceContractingCompanyName: getFieldValue([
        '次承攬公司',
        '次承攬廠商',
        '次承包公司',
      ]) as string,
      certifications: certifications as Certification[],
      reviewStaff: getFieldValue(['審核人員', '審核者', '審核人']) as string,
      idno: getFieldValue(['身分證', '身份證號碼']) as string,
      no: null,
      medicalExamPictures: [],
    };
  }

  // 格式化日期（假設Excel中的日期可能有不同格式）
  formatDate(dateValue: any): string {
    if (!dateValue) return '';

    // 如果是數字（Excel序列號）
    if (typeof dateValue === 'number') {
      // Excel日期從1900年1月1日開始，但有一個bug，認為1900是閏年
      const excelEpoch = new Date(1899, 11, 30);
      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      const date = new Date(
        excelEpoch.getTime() + dateValue * millisecondsPerDay
      );
      return dayjs(date).format('YYYY-MM-DD');
    }

    // 嘗試解析字串格式
    return dayjs(dateValue).isValid()
      ? dayjs(dateValue).format('YYYY-MM-DD')
      : '';
  }

  // 分析 ZIP 中的圖片檔案數量（不載入檔案，只統計）
  async analyzeImagesInZip(
    workers: Worker[],
    zipContent: JSZip
  ): Promise<{
    totalImages: number;
    profilePictures: number;
    idCards: number;
    otherDocs: number;
  }> {
    let totalImages = 0;
    let profilePictures = 0;
    let idCards = 0;
    let otherDocs = 0;

    for (const worker of workers) {
      if (!worker.idno || !worker.name) continue;

      // 尋找以身份證號開頭的檔案
      const workerFiles = Object.keys(zipContent.files).filter((path) =>
        path.startsWith('人員入場資料/' + worker.idno)
      );

      for (const filePath of workerFiles) {
        const fileName = filePath.split('/').pop();
        if (!fileName) continue;

        // 檢查檔案是否為圖片格式
        const isImage = /\.(jpg|jpeg|png)$/i.test(fileName);
        if (!isImage) continue;

        // 解析檔名格式：{idNumber}_{name}_{code}.jpg/jpeg/png
        const fileNameWithoutExt = fileName.replace(/\.(jpg|jpeg|png)$/i, '');
        const parts = fileNameWithoutExt.split('_');

        if (parts.length !== 3) continue;

        const [fileIdno, fileName_part, code] = parts;

        // 驗證身份證號和姓名是否匹配
        if (fileIdno !== worker.idno || fileName_part !== worker.name) continue;

        totalImages++;

        // 分類統計
        const upperCode = code.toUpperCase();
        if (upperCode === 'P') {
          profilePictures++;
        } else if (upperCode === 'IDF' || upperCode === 'IDR') {
          idCards++;
        } else {
          otherDocs++;
        }
      }
    }

    return {
      totalImages,
      profilePictures,
      idCards,
      otherDocs,
    };
  }

  // 重置匯入狀態
  resetImportState() {
    this.isProcessing = false;
    this.processProgress = 0;
    this.processStatus = '';
    this.isCompleted = false;
    this.importResult = null;
    this.validWorkersToImport = [];
    this.zipContent = null;
  }

  // 顯示錯誤訊息
  showError(message: string) {
    this.isProcessing = false;
    this.importResult = {
      success: false,
      message,
    };
  }

  // 清理 modal 相關狀態
  private cleanupModalState() {
    // 移除可能殘留的 backdrop
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach((backdrop) => backdrop.remove());

    // 移除 body 上的 modal 相關 class 和樣式
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    // 移除可能的滾動鎖定
    const htmlElement = document.documentElement;
    htmlElement.style.overflow = '';
  }

  // 手動關閉modal時的處理
  closeModal() {
    this.resetImportState();

    // 延遲清理modal狀態，確保bootstrap modal完全關閉
    setTimeout(() => {
      this.cleanupModalState();
    }, 200);
  }

  // 儲存有效的工作人員資料
  validWorkersToImport: Worker[] = [];

  // 儲存 ZIP 內容以便後續處理圖片
  private zipContent: JSZip | null = null;

  // 匯入並刷新
  async refreshData() {
    if (this.validWorkersToImport.length === 0) {
      return;
    }

    try {
      // 確保 modal 保持開啟狀態
      const modalElement = document.getElementById('importWorkerModal');
      if (modalElement) {
        const modalInstance =
          (window as any).bootstrap.Modal.getInstance(modalElement) ||
          new (window as any).bootstrap.Modal(modalElement);
        modalInstance.show();
      }

      this.isProcessing = true;
      this.processStatus = '正在準備匯入...';
      this.processProgress = 0;
      this.isCompleted = false; // 重置完成狀態
      // 清除之前的匯入結果，避免顯示混亂
      this.importResult = null;

      // 先取得現有的工作人員資料，用於檢查是否有相同身份證的記錄
      this.processStatus = '正在檢查現有資料...';
      this.processProgress = 5;
      const existingWorkersResult = await this.mongodbService.getArray('worker', {}, {
        limit: 0, // 0 表示載入所有資料
        projection: {
          // 只載入必要的欄位，排除圖片以減少傳輸
          _id: 1,
          idno: 1,
          contractingCompanyName: 1,
          name: 1
        }
      });

      // 處理返回結果
      let existingWorkers: Worker[] = [];
      if (existingWorkersResult && typeof existingWorkersResult === 'object' && 'data' in existingWorkersResult && 'pagination' in existingWorkersResult) {
        existingWorkers = existingWorkersResult.data as Worker[];
      } else {
        existingWorkers = Array.isArray(existingWorkersResult) ? existingWorkersResult as Worker[] : [];
      }

      // 建立索引以快速查找
      const workerIndex = new Map<string, Worker>();
      existingWorkers.forEach((worker: Worker) => {
        // 使用身份證+承攬公司作為唯一鍵
        if (worker.idno && worker.contractingCompanyName) {
          const key = `${worker.idno}_${worker.contractingCompanyName}`;
          workerIndex.set(key, worker);
        }
      });

      // 統計資訊
      let newCount = 0;
      let updateCount = 0;
      let imageCount = 0;

      this.processStatus = '正在匯入人員資料...';
      this.processProgress = 10;

      // 第一階段：匯入人員基本資料（10% - 50%）
      for (let i = 0; i < this.validWorkersToImport.length; i++) {
        const worker = this.validWorkersToImport[i];

        // 更新詳細狀態訊息
        this.processStatus = `正在匯入人員資料... (${i + 1}/${this.validWorkersToImport.length
          })\n目前處理：${worker.name} (${worker.idno})`;
        this.processProgress =
          10 + Math.floor((i / this.validWorkersToImport.length) * 40);

        // 檢查是否有相同身份證號+承攬公司的記錄
        const key = `${worker.idno}_${worker.contractingCompanyName}`;
        const existingWorker = workerIndex.get(key);

        if (existingWorker) {
          // 如果存在相同記錄，則更新而非新增
          worker._id = existingWorker._id;
          if (worker._id) {
            await this.mongodbService.put('worker', worker._id, worker);
            updateCount++;
          } else {
            // 原本有記錄但_id缺失，做新增
            const result = await this.mongodbService.post('worker', worker);
            if (result.insertedId) {
              worker._id = result.insertedId;
            }
            newCount++;
          }
        } else {
          // 找不到現有工人，進行新增
          const result = await this.mongodbService.post('worker', worker);
          if (result.insertedId) {
            worker._id = result.insertedId;
          }
          newCount++;
        }
      }

      // 第二階段：處理圖片上傳（50% - 90%）
      if (this.zipContent) {
        this.processStatus = '正在上傳圖片檔案...';
        this.processProgress = 50;

        for (let i = 0; i < this.validWorkersToImport.length; i++) {
          const worker = this.validWorkersToImport[i];

          // 更新詳細狀態訊息
          this.processStatus = `正在上傳圖片檔案... (${i + 1}/${this.validWorkersToImport.length
            })\n目前處理：${worker.name} (${worker.idno})`;
          this.processProgress =
            50 + Math.floor((i / this.validWorkersToImport.length) * 40);

          // 處理該工人的圖片，並取得詳細資訊
          const uploadResult = await this.loadWorkerImagesFromZipWithDetails(
            worker,
            this.zipContent,
            (imageType: string) => {
              this.processStatus = `正在上傳圖片檔案... (${i + 1}/${this.validWorkersToImport.length
                })\n目前處理：${worker.name} (${worker.idno
                })\n上傳圖片：${imageType}`;
            }
          );

          imageCount += uploadResult.count;

          // 如果有上傳圖片，更新工人資料
          if (uploadResult.count > 0 && worker._id) {
            await this.mongodbService.put('worker', worker._id, worker);
          }
        }
      }

      // 第三階段：重新載入資料（90% - 100%）
      this.processStatus = '正在重新載入資料...';
      this.processProgress = 90;

      // 重新加載資料（重置到第一頁）
      this.currentPage = 1;
      await this.loadWorkersData();

      // 重新初始化過濾器選項
      await this.initializeFilterOptions();

      if (this.api) {
        this.api.setGridOption('rowData', this.filteredWorkers);
      }

      this.processStatus = `匯入完成（新增: ${newCount}, 更新: ${updateCount}${imageCount > 0 ? `, 圖片: ${imageCount}` : ''
        }）`;
      this.processProgress = 100;
      this.isCompleted = true; // 標記為已完成

      // 更新匯入結果顯示
      this.importResult = {
        success: true,
        message: `匯入完成！新增 ${newCount} 筆，更新 ${updateCount} 筆${imageCount > 0 ? `，上傳 ${imageCount} 張圖片` : ''
          }`,
        details: [
          '所有資料已成功匯入資料庫',
          '頁面資料已重新載入',
          '您可以點擊「關閉」按鈕查看結果',
        ],
      };
    } catch (error) {
      console.error('匯入資料時發生錯誤', error);
      this.showError(
        `匯入資料時發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'
        }`
      );

      // 錯誤時不需要清理modal狀態，讓使用者可以看到錯誤訊息
      // 只有在使用者手動關閉時才清理
    } finally {
      this.isProcessing = false;
    }
  }

  // 檢查ZIP中是否有該工人的圖片檔案（帶詳細進度回調）
  async loadWorkerImagesFromZipWithDetails(
    worker: Worker,
    zipContent: JSZip,
    progressCallback: (imageType: string) => void
  ): Promise<{ count: number }> {
    if (!worker.idno || !worker.name) {
      return { count: 0 }; // 沒有身份證號或姓名就無法匹配
    }

    let uploadedCount = 0;

    // 圖片代碼對應的欄位映射和中文名稱
    const imageCodeMap: { [key: string]: { field: string; name: string } } = {
      IDF: { field: 'idCardFrontPicture', name: '身份證正面' },
      IDR: { field: 'idCardBackPicture', name: '身份證反面' },
      L: { field: 'laborInsurancePicture', name: '勞保證明' },
      P: { field: 'profilePicture', name: '大頭照' },
      '6F': { field: 'sixHourTrainingFrontPicture', name: '6小時證明正面' },
      '6R': { field: 'sixHourTrainingBackPicture', name: '6小時證明反面' },
      // 注意：G1、G2、G3 等意外險圖片現在由專門的意外險處理邏輯處理
    };

    // 建立證照類型對照表
    const certificationMap = CertificationTypeManager.getCertificationMap();

    try {
      // 尋找以身份證號開頭的資料夾
      const workerFiles = Object.keys(zipContent.files).filter((path) =>
        path.startsWith('人員入場資料/' + worker.idno)
      );

      if (workerFiles.length === 0) {
        console.log(`未找到工人 ${worker.name} (${worker.idno}) 的圖片資料夾`);
        return { count: uploadedCount };
      }

      // 處理每個找到的圖片檔案
      for (const filePath of workerFiles) {
        const fileName = filePath.split('/').pop();
        if (!fileName) continue;

        // 檢查檔案是否為圖片格式
        const isImage = /\.(jpg|jpeg|png)$/i.test(fileName);
        if (!isImage) continue;

        // 解析檔名格式：{idNumber}_{name}_{code}.jpg/jpeg/png
        const fileNameWithoutExt = fileName.replace(/\.(jpg|jpeg|png)$/i, '');
        const parts = fileNameWithoutExt.split('_');

        if (parts.length !== 3) {
          console.warn(
            `圖片檔名格式不正確：${fileName}，應為 {身份證號}_{姓名}_{代碼}.{副檔名}`
          );
          continue;
        }

        const [fileIdno, fileName_part, code] = parts;

        // 驗證身份證號和姓名是否匹配
        if (fileIdno !== worker.idno) {
          console.warn(
            `圖片檔案 ${fileName} 的身份證號 ${fileIdno} 與工人資料 ${worker.idno} 不符`
          );
          continue;
        }

        if (fileName_part !== worker.name) {
          console.warn(
            `圖片檔案 ${fileName} 的姓名 ${fileName_part} 與工人資料 ${worker.name} 不符`
          );
          continue;
        }

        // 檢查是否為一般圖片代碼
        const imageInfo = imageCodeMap[code.toUpperCase()];
        let isCertificationImage = false;
        let certType: CertificationType | null = null;
        let isfront = false;
        let isMedicalExamImage = false;
        let isAccidentInsuranceImage = false;

        if (!imageInfo) {
          // 檢查是否為體檢報告圖片代碼 (格式: H 或 H+數字)
          const upperCode = code.toUpperCase();
          if (upperCode === 'H' || /^H\d+$/.test(upperCode)) {
            isMedicalExamImage = true;
          } else if (/^G\d+/.test(upperCode)) {
            // 檢查是否為意外險圖片代碼 (格式: G+數字，支援 G1、G1-1、G11 等)
            isAccidentInsuranceImage = true;
          } else if (upperCode.endsWith('F') || upperCode.endsWith('R')) {
            // 檢查是否為證照圖片代碼 (格式: {type}F 或 {type}R)
            const certCode = upperCode.slice(0, -1); // 移除最後的F或R
            isfront = upperCode.endsWith('F');

            // 檢查是否為有效的證照類型
            certType = CertificationTypeManager.getTypeByCode(certCode) || null;
            if (certType) {
              isCertificationImage = true;
            }
          }

          if (!isCertificationImage && !isMedicalExamImage && !isAccidentInsuranceImage) {
            console.warn(`未知的圖片代碼：${code}，檔案：${fileName}`);
            continue;
          }
        }

        try {
          // 讀取圖片檔案
          const fileData = await zipContent.files[filePath].async('arraybuffer');
          const blob = new Blob([fileData], { type: 'image/jpeg' });

          if (isMedicalExamImage) {
            // 處理體檢報告圖片
            const imageName = `體檢報告${code === 'H' ? '' : '-' + code.substring(1)}`;

            // 更新進度回調
            progressCallback(imageName);

            // 初始化 medicalExamPictures 陣列（如果不存在）
            if (!worker.medicalExamPictures) {
              worker.medicalExamPictures = [];
            }

            // 查詢舊的體檢報告圖片
            const oldFiles = await this.gridFSService.getFiles({
              metadata: {
                workerId: worker._id,
                imageType: 'medicalExam',
                originalFileName: fileName,
              }
            });
            if (oldFiles.files.length > 0) {
              // 刪除舊的體檢報告圖片
              for (const oldFile of oldFiles.files) {
                await this.gridFSService.deleteFile(oldFile.filename);
              }
            }

            // 上傳圖片到 GridFS
            const file = new File([blob], fileName, { type: blob.type });
            const metadata = {
              workerId: worker._id || '',
              workerName: worker.name,
              workerIdno: worker.idno,
              imageType: 'medicalExam',
              medicalExamIndex: code === 'H' ? 0 : parseInt(code.substring(1)) || 0,
              originalFileName: fileName,
              uploadSource: 'zipImport',
            };

            // 上傳新的體檢報告圖片
            const result = await this.gridFSService.uploadFile(file, metadata);
            const imageUrl = `/api/gridfs/${result.filename}`;

            // 將 GridFS URL 加入到 medicalExamPictures 陣列
            worker.medicalExamPictures.push(imageUrl);

            uploadedCount++;
            console.log(
              `成功上傳工人 ${worker.name} 的體檢報告圖片：${code} -> ${imageName}, URL: ${imageUrl}`
            );

          } else if (isCertificationImage && certType) {
            // 處理證照圖片
            const certName = CertificationTypeManager.getName(certType);
            const imageName = `${certName}-${isfront ? '正面' : '反面'}`;

            // 更新進度回調
            progressCallback(imageName);

            // 確保 certifications 陣列存在
            if (!worker.certifications) {
              worker.certifications = [];
            }

            // 檢查工人是否已有該證照
            let certification = worker.certifications.find(cert => cert.type === certType);

            if (!certification) {
              // 新增證照
              certification = {
                type: certType,
                name: certName,
                issue: '',
                withdraw: '',
                frontPicture: '',
                backPicture: ''
              };
              worker.certifications.push(certification);
              console.log(`為工人 ${worker.name} 新增證照：${certName}`);
            }

            // 上傳圖片到 GridFS
            const file = new File([blob], fileName, { type: blob.type });
            const metadata = {
              workerId: worker._id || '',
              workerName: worker.name,
              workerIdno: worker.idno,
              imageType: isfront ? 'certificationFront' : 'certificationBack',
              certificationType: certType,
              originalFileName: fileName,
              uploadSource: 'zipImport',
            };

            // 刪除舊的證照圖片（如果存在）
            const oldImageUrl = isfront ? certification.frontPicture : certification.backPicture;
            if (oldImageUrl && oldImageUrl.startsWith('/api/gridfs/')) {
              const oldFilename = oldImageUrl.replace('/api/gridfs/', '');
              try {
                await this.gridFSService.deleteFile(oldFilename);
                console.log(`已刪除工人 ${worker.name} 的舊證照圖片: ${oldFilename}`);
              } catch (error) {
                console.warn(`刪除舊證照圖片失敗，繼續上傳新圖片: ${error}`);
              }
            }

            // 上傳新的證照圖片
            const result = await this.gridFSService.uploadFile(file, metadata);
            const imageUrl = `/api/gridfs/${result.filename}`;

            // 將 GridFS URL 指派給對應的證照欄位
            if (isfront) {
              certification.frontPicture = imageUrl;
            } else {
              certification.backPicture = imageUrl;
            }

            uploadedCount++;
            console.log(
              `成功上傳工人 ${worker.name} 的證照圖片：${code} -> ${imageName}, URL: ${imageUrl}`
            );

          } else if (isAccidentInsuranceImage) {
            // 處理意外險圖片
            // 解析意外險索引：G1/G1-1/G11 等都視為第一個意外險 (索引0)
            // G2/G2-1/G22 等都視為第二個意外險 (索引1)
            let accidentIndex = 0;
            if (code.startsWith('G1')) {
              accidentIndex = 0; // 第一個意外險
            } else if (code.startsWith('G2')) {
              accidentIndex = 1; // 第二個意外險
            } else if (code.startsWith('G3')) {
              accidentIndex = 2; // 第三個意外險
            } else {
              // 其他 G 開頭的，嘗試解析數字
              const match = code.match(/^G(\d+)/);
              if (match) {
                accidentIndex = parseInt(match[1]) - 1;
              }
            }
            
            const imageName = `意外險證明-${accidentIndex + 1}`;

            // 更新進度回調
            progressCallback(imageName);

            // 初始化 accidentInsurances 陣列（如果不存在）
            if (!worker.accidentInsurances) {
              worker.accidentInsurances = [];
            }

            // 檢查是否已有對應索引的意外險資料，如果沒有則新增
            while (worker.accidentInsurances.length <= accidentIndex) {
              worker.accidentInsurances.push({
                start: '',
                end: '',
                amount: '',
                signDate: '',
                companyName: '',
                pictures: [] // 初始化圖片陣列
              });
              console.log(`為工人 ${worker.name} 新增意外險資料 #${worker.accidentInsurances.length}`);
            }

            // 上傳圖片到 GridFS
            const file = new File([blob], fileName, { type: blob.type });
            const metadata = {
              workerId: worker._id || '',
              workerName: worker.name,
              workerIdno: worker.idno,
              imageType: 'accidentInsurance',
              accidentInsuranceIndex: accidentIndex,
              originalFileName: fileName,
              uploadSource: 'zipImport',
            };

            // 查詢舊的意外險圖片（基於相同的檔名）
            const oldFiles = await this.gridFSService.getFiles({
              metadata: {
                workerId: worker._id,
                imageType: 'accidentInsurance',
                accidentInsuranceIndex: accidentIndex,
                originalFileName: fileName,
              }
            });
            if (oldFiles.files.length > 0) {
              // 刪除舊的意外險圖片
              for (const oldFile of oldFiles.files) {
                await this.gridFSService.deleteFile(oldFile.filename);
              }
            }

            // 上傳新的意外險圖片
            const result = await this.gridFSService.uploadFile(file, metadata);
            const imageUrl = `/api/gridfs/${result.filename}`;

            // 將 GridFS URL 加入到意外險資料中
            const accidentInsurance = worker.accidentInsurances[accidentIndex];
            
            // 初始化 pictures 陣列（如果不存在）
            if (!accidentInsurance.pictures) {
              accidentInsurance.pictures = [];
            }
            
            // 檢查是否已存在相同的圖片 URL，避免重複添加
            if (!accidentInsurance.pictures.includes(imageUrl)) {
              accidentInsurance.pictures.push(imageUrl);
            }
            
            // 向後相容：如果沒有 picture 欄位，將第一張圖片設為 picture
            if (!(accidentInsurance as any).picture && accidentInsurance.pictures.length === 1) {
              (accidentInsurance as any).picture = imageUrl;
            }

            uploadedCount++;
            console.log(
              `成功上傳工人 ${worker.name} 的意外險圖片：${code} -> ${imageName}, URL: ${imageUrl}`
            );

          } else if (imageInfo) {
            // 處理一般圖片
            // 更新進度回調
            progressCallback(imageInfo.name);

            // 檢查是否為大頭貼（使用 base64）
            if (imageInfo.field === 'profilePicture') {
              // 大頭貼使用 base64 存儲，需要 resize
              const base64String = await this.convertBlobToBase64(
                blob,
                imageInfo.field
              );
              (worker as any)[imageInfo.field] = base64String;
              uploadedCount++;
              console.log(
                `成功載入工人 ${worker.name} 的大頭貼：${code} -> ${imageInfo.field}`
              );
            } else {
              // 其他圖片直接上傳原始檔案到 GridFS
              const file = new File([blob], fileName, { type: blob.type });

              // 準備元數據
              const metadata = {
                workerId: worker._id || '',
                workerName: worker.name,
                workerIdno: worker.idno,
                imageType: imageInfo.field,
                originalFileName: fileName,
                uploadSource: 'zipImport',
              };

              // 在上傳新圖片前，先檢查並刪除該工人對應類型的舊圖片
              // 先找出 server 有沒有舊照片
              const oldFiles = await this.gridFSService.getFiles({
                metadata: {
                  workerId: worker._id,
                  imageType: imageInfo.field,
                }
              });
              if (oldFiles.files.length > 0) {
                // 刪除舊照片
                for (const oldFile of oldFiles.files) {
                  await this.gridFSService.deleteFile(oldFile.filename);
                }
              }

              // 上傳新的圖片檔案到 GridFS
              const result = await this.gridFSService.uploadFile(file, metadata);
              const imageUrl = `/api/gridfs/${result.filename}`;

              // 將 GridFS URL 指派給對應的欄位
              (worker as any)[imageInfo.field] = imageUrl;
              uploadedCount++;

              console.log(
                `成功上傳工人 ${worker.name} 的圖片到 GridFS：${code} -> ${imageInfo.field}, URL: ${imageUrl}`
              );
            }
          }
        } catch (error) {
          console.error(`載入圖片檔案 ${fileName} 時發生錯誤:`, error);
        }
      }
    } catch (error) {
      console.error(
        `處理工人 ${worker.name} (${worker.idno}) 的圖片時發生錯誤:`,
        error
      );
    }

    return { count: uploadedCount };
  }

  // 檢查ZIP中是否有該工人的圖片檔案
  async loadWorkerImagesFromZip(
    worker: Worker,
    zipContent: JSZip
  ): Promise<number> {
    if (!worker.idno || !worker.name) {
      return 0; // 沒有身份證號或姓名就無法匹配
    }

    let uploadedCount = 0;

    // 圖片代碼對應的欄位映射
    const imageCodeMap: { [key: string]: string } = {
      IDF: 'idCardFrontPicture', // 身份證正面
      IDR: 'idCardBackPicture', // 身份證反面
      L: 'laborInsurancePicture', // 勞保證明
      P: 'profilePicture', // 大頭照
      '6F': 'sixHourTrainingFrontPicture', // 6小時證明正面
      '6R': 'sixHourTrainingBackPicture', // 6小時證明反面
      // 注意：G1、G2、G3 等意外險圖片現在由專門的意外險處理邏輯處理
    };

    try {
      // 尋找以身份證號開頭的資料夾
      const workerFolderPattern = new RegExp(`^${worker.idno}/`, 'i');
      const workerFiles = Object.keys(zipContent.files).filter((path) =>
        path.startsWith('人員入場資料/' + worker.idno)
      );

      if (workerFiles.length === 0) {
        console.log(`未找到工人 ${worker.name} (${worker.idno}) 的圖片資料夾`);
        return uploadedCount;
      }

      // 處理每個找到的圖片檔案
      for (const filePath of workerFiles) {
        const fileName = filePath.split('/').pop();
        if (!fileName) continue;

        // 檢查檔案是否為圖片格式
        const isImage = /\.(jpg|jpeg|png)$/i.test(fileName);
        if (!isImage) continue;

        // 解析檔名格式：{idNumber}_{name}_{code}.jpg/jpeg/png
        const fileNameWithoutExt = fileName.replace(/\.(jpg|jpeg|png)$/i, '');
        const parts = fileNameWithoutExt.split('_');

        if (parts.length !== 3) {
          console.warn(
            `圖片檔名格式不正確：${fileName}，應為 {身份證號}_{姓名}_{代碼}.{副檔名}`
          );
          continue;
        }

        const [fileIdno, fileName_part, code] = parts;

        // 驗證身份證號和姓名是否匹配
        if (fileIdno !== worker.idno) {
          console.warn(
            `圖片檔案 ${fileName} 的身份證號 ${fileIdno} 與工人資料 ${worker.idno} 不符`
          );
          continue;
        }

        if (fileName_part !== worker.name) {
          console.warn(
            `圖片檔案 ${fileName} 的姓名 ${fileName_part} 與工人資料 ${worker.name} 不符`
          );
          continue;
        }

        // 檢查代碼是否有效
        const fieldName = imageCodeMap[code.toUpperCase()];
        const upperCode = code.toUpperCase();
        const isMedicalExamImage = upperCode === 'H' || /^H\d+$/.test(upperCode);
        const isAccidentInsuranceImage = /^G\d+/.test(upperCode);

        if (!fieldName && !isMedicalExamImage && !isAccidentInsuranceImage) {
          console.warn(`未知的圖片代碼：${code}，檔案：${fileName}`);
          continue;
        }

        try {
          // 讀取圖片檔案
          const fileData = await zipContent.files[filePath].async(
            'arraybuffer'
          );
          const blob = new Blob([fileData], { type: 'image/jpeg' });

          if (isMedicalExamImage) {
            // 處理體檢報告圖片
            // 初始化 medicalExamPictures 陣列（如果不存在）
            if (!worker.medicalExamPictures) {
              worker.medicalExamPictures = [];
            }

            // 上傳圖片到 GridFS
            const file = new File([blob], fileName, { type: blob.type });
            const metadata = {
              workerId: worker._id || '',
              workerName: worker.name,
              workerIdno: worker.idno,
              imageType: 'medicalExam',
              medicalExamIndex: code === 'H' ? 0 : parseInt(code.substring(1)) || 0,
              originalFileName: fileName,
              uploadSource: 'zipImport',
            };

            // 上傳新的體檢報告圖片
            const result = await this.gridFSService.uploadFile(file, metadata);
            const imageUrl = `/api/gridfs/${result.filename}`;

            // 將 GridFS URL 加入到 medicalExamPictures 陣列
            worker.medicalExamPictures.push(imageUrl);

            uploadedCount++;
            console.log(
              `成功上傳工人 ${worker.name} 的體檢報告圖片：${code}, URL: ${imageUrl}`
            );

          } else if (isAccidentInsuranceImage) {
            // 處理意外險圖片
            const accidentIndex = parseInt(code.substring(1)) - 1; // G1=索引0, G2=索引1, G3=索引2

            // 初始化 accidentInsurances 陣列（如果不存在）
            if (!worker.accidentInsurances) {
              worker.accidentInsurances = [];
            }

            // 檢查是否已有對應索引的意外險資料，如果沒有則新增
            while (worker.accidentInsurances.length <= accidentIndex) {
              worker.accidentInsurances.push({
                start: '',
                end: '',
                amount: '',
                signDate: '',
                companyName: ''
              });
              console.log(`為工人 ${worker.name} 新增意外險資料 #${worker.accidentInsurances.length}`);
            }

            // 上傳圖片到 GridFS
            const file = new File([blob], fileName, { type: blob.type });
            const metadata = {
              workerId: worker._id || '',
              workerName: worker.name,
              workerIdno: worker.idno,
              imageType: 'accidentInsurance',
              accidentInsuranceIndex: accidentIndex,
              originalFileName: fileName,
              uploadSource: 'zipImport',
            };

            // 上傳新的意外險圖片
            const result = await this.gridFSService.uploadFile(file, metadata);
            const imageUrl = `/api/gridfs/${result.filename}`;

            // 將 GridFS URL 加入到意外險資料中
            (worker.accidentInsurances[accidentIndex] as any).picture = imageUrl;

            uploadedCount++;
            console.log(
              `成功上傳工人 ${worker.name} 的意外險圖片：${code}, URL: ${imageUrl}`
            );

          } else if (fieldName) {
            // 檢查是否為大頭貼（使用 base64）
            if (fieldName === 'profilePicture') {
              // 大頭貼使用 base64 存儲，需要 resize
              const base64String = await this.convertBlobToBase64(
                blob,
                fieldName
              );
              (worker as any)[fieldName] = base64String;
              uploadedCount++;
              console.log(
                `成功載入工人 ${worker.name} 的大頭貼：${code} -> ${fieldName}`
              );
            } else {
              // 其他圖片直接上傳原始檔案到 GridFS
              const file = new File([blob], fileName, { type: blob.type });

              // 準備元數據
              const metadata = {
                workerId: worker._id || '',
                workerName: worker.name,
                workerIdno: worker.idno,
                imageType: fieldName,
                originalFileName: fileName,
                uploadSource: 'zipImport',
              };

              // 在上傳新圖片前，先檢查並刪除該工人對應類型的舊圖片
              if ((worker as any)[fieldName]) {
                const oldImageUrl = (worker as any)[fieldName];
                // 如果舊圖片是 GridFS URL，則刪除舊檔案
                if (oldImageUrl && oldImageUrl.startsWith('/api/gridfs/')) {
                  const oldFilename = oldImageUrl.replace('/api/gridfs/', '');
                  try {
                    await this.gridFSService.deleteFile(oldFilename);
                    console.log(`已刪除工人 ${worker.name} 的舊圖片: ${oldFilename}`);
                  } catch (error) {
                    console.warn(`刪除舊圖片失敗，繼續上傳新圖片: ${error}`);
                  }
                }
              }

              // 上傳新的圖片檔案到 GridFS
              const result = await this.gridFSService.uploadFile(file, metadata);
              const imageUrl = `/api/gridfs/${result.filename}`;

              // 將 GridFS URL 指派給對應的欄位
              (worker as any)[fieldName] = imageUrl;
              uploadedCount++;

              console.log(
                `成功上傳工人 ${worker.name} 的圖片到 GridFS：${code} -> ${fieldName}, URL: ${imageUrl}`
              );
            }
          }
        } catch (error) {
          console.error(`載入圖片檔案 ${fileName} 時發生錯誤:`, error);
        }
      }
    } catch (error) {
      console.error(
        `處理工人 ${worker.name} (${worker.idno}) 的圖片時發生錯誤:`,
        error
      );
    }

    return uploadedCount;
  }

  // 將Blob轉換為base64字串並進行resize（僅用於大頭貼）
  private convertBlobToBase64(blob: Blob, fieldName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          // 根據圖片類型設定最大尺寸
          const maxDimension = fieldName === 'profilePicture' ? 100 : 480;

          // 計算新的尺寸，保持比例
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDimension) {
              height = Math.round(height * (maxDimension / width));
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round(width * (maxDimension / height));
              height = maxDimension;
            }
          }

          // 創建 canvas 並繪製調整大小後的圖片
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('無法取得 canvas 上下文'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 將 canvas 轉換為 base64 字串
          const base64String = canvas.toDataURL('image/jpeg', 0.9);
          resolve(base64String);
        };

        img.onerror = () => {
          reject(new Error('圖片加載失敗'));
        };

        img.src = readerEvent.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error('檔案讀取失敗'));
      };

      reader.readAsDataURL(blob);
    });
  }


}
