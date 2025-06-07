import { CommonModule } from '@angular/common';
import {
  Component,
  OnDestroy,
  Signal,
  WritableSignal,
  signal,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
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
import {
  Certification,
  CertificationType,
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
  imports: [AgGridModule, RouterModule, CommonModule],
  templateUrl: './worker-list.component.html',
  styleUrl: './worker-list.component.scss',
})
export class WorkerListComponent implements OnDestroy {
  workers: WorkerWithFlag[] = [];

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
      headerName: '照片',
      field: 'profilePicture',
      width: 60,
      pinned: 'left',
      suppressAutoSize: true,
      sortable: false,
      cellRenderer: (params: any) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.height = '100%';

        if (params.data.profilePicture) {
          // 如果有大頭貼，顯示圖片
          const img = document.createElement('img');
          img.src = params.data.profilePicture;
          img.style.width = '40px';
          img.style.height = '40px';
          img.style.borderRadius = '50%';
          img.style.objectFit = 'cover';
          img.style.border = '2px solid #ddd';
          img.alt = '大頭貼';
          img.title = params.data.name + ' 的大頭貼';
          div.appendChild(img);
        } else {
          // 如果沒有大頭貼，顯示預設圖示
          const icon = document.createElement('i');
          icon.className = 'bi bi-person-circle fs-3 text-muted';
          icon.title = '無大頭貼';
          div.appendChild(icon);
        }

        return div;
      },
      onCellClicked: (params) => {
        this.router.navigate(['/worker', params.data._id]);
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
        this.router.navigate(['/worker', params.data._id]);
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
          div.innerHTML = `${params.data.name} <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>`;
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
        this.router.navigate(['/worker', params.data._id]);
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
        this.router.navigate(['/worker', params.data._id]);
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
                '<i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        return params.data.certifications.length;
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '施工架組配作業主管證照(sa)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },

    {
      headerName: '營造作業主管證照(s)',
      field: 's',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '營造作業主管證照(s)已過期';
        }

        div.innerHTML = html;
        return div;
      },
    },
    {
      headerName: '作業主管證照(ma)',
      field: 'ma',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => {
        // 顯示起始日期到結束日期
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
          div.style.backgroundColor = 'red';
          div.style.color = 'white';
          div.title = '作業主管證照(ma)已過期';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
        const cert = params.data.certifications.find(
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
            ' <i class="bi bi-exclamation-triangle text-danger" title="已過期"></i>';
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
    defaultColDef: this.defaultColDef,
    columnDefs: this.columnDefs,
    rowHeight: 40,
    rowData: this.workers,
    // onCellClicked: (params) => {
    //   console.log(params);
    //   // navigate to user detail page
    //   this.router.navigate(['/worker', params.data._id]);
    // },
    // getRowStyle: (params) => {
    //   return {
    //     backgroundColor:
    //       params.data.gender === '男' ? 'lightblue' : 'lightpink',
    //   };
    // },
  };

  api: GridApi | undefined;

  constructor(
    private router: Router,
    private mongodbService: MongodbService,
    private gridFSService: GridFSService
  ) {}

  ngOnDestroy() {
    // 組件銷毀時清理 modal 狀態
    this.cleanupModalState();
  }

  async ngOnInit() {
    this.workers = await this.mongodbService.get('worker', {});

    if (this.workers.length === 0) {
      // random 20 rows data
      this.workers = Array.from({ length: 10 }, (_, index) =>
        this.generateRandomWorker(index)
      );

      for (const worker of this.workers) {
        let result = await this.mongodbService.post('worker', worker);
        if (result.insertedId) {
          worker._id = result.insertedId;
        }
      }
    } else {
      // 轉換普通 Worker 為 WorkerWithFlag
      this.workers = this.workers.map((worker) => {
        const workerWithFlag = worker as unknown as WorkerWithFlag;
        workerWithFlag.isValid = signal(true);
        workerWithFlag.certifications =
          worker.certifications as CertificationWithFlag[];
        return workerWithFlag;
      });
    }
    console.log(this.workers);

    // 檢查意外險或證照是否過期
    for (const worker of this.workers) {
      this.checkWorkerValidity(worker);
    }

    if (this.api) {
      this.api.setGridOption('rowData', this.workers);
    }
  }

  checkWorkerValidity(worker: WorkerWithFlag): WritableSignal<boolean> {
    // 使用已經存在的 signal
    const workerIsValid = worker.isValid;

    // 預設為有效
    workerIsValid.set(true);

    // 檢查意外險是否過期
    if (worker.accidentInsurances.length > 0) {
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
    if (worker.certifications.length > 0) {
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
      medicalExamPicture: '',
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
    if (this.workers && this.workers.length > 0) {
      this.api.setGridOption('rowData', this.workers);
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
      const zipContent = await zip.loadAsync(file);

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

      // 將工作表轉換為JSON
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
      console.log('Excel欄位名稱樣本：', sampleKeys);

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
        this.processStatus = `正在處理第 ${i + 1}/${
          jsonData.length
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
        // 檢查 ZIP 中的圖片檔案數量（不載入，只計算）
        const imageStats = await this.analyzeImagesInZip(
          validWorkers,
          zipContent
        );

        this.importResult = {
          success: true,
          message: `成功解析 ${validWorkers.length} 筆人員資料${
            imageStats.totalImages > 0
              ? `，發現 ${imageStats.totalImages} 張圖片`
              : ''
          }，可以進行匯入`,
          details: [
            `總共 ${validWorkers.length} 筆資料`,
            ...(imageStats.totalImages > 0
              ? [
                  `發現 ${imageStats.totalImages} 張圖片檔案`,
                  `包含：大頭照 ${imageStats.profilePictures} 張、身份證 ${imageStats.idCards} 張、其他證照 ${imageStats.otherDocs} 張`,
                ]
              : ['未發現相關圖片檔案']),
            '圖片檔名格式：{身份證號}_{姓名}_{代碼}.jpg/jpeg/png',
            '支援的圖片代碼：IDF(身份證正面)、IDR(身份證反面)、P(大頭照)、L/G(勞保證明)、6F(六小時證明正面)、6R(六小時證明反面)、H(體檢報告)',
            '點擊「匯入並刷新」開始匯入資料和上傳圖片',
          ],
        };

        // 儲存有效的工作人員資料，以便稍後匯入
        this.validWorkersToImport = validWorkers;
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
        `處理檔案時發生錯誤: ${
          error instanceof Error ? error.message : '未知錯誤'
        }`
      );
    } finally {
      this.isProcessing = false;
    }
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
        getFieldValue([`意外險有效期${i}\r\n(起始日)`])
      );
      const end = this.formatDate(
        getFieldValue([`意外險有效期${i}\r\n(截止日)`])
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

    // 證照對照表
    const certificationMap: { [key: string]: { code: string; name: string } } =
      {
        a: { code: 'a', name: '高空作業車操作人員' },
        bosh: { code: 'bosh', name: '乙級職業安全管理員' },
        aos: { code: 'aos', name: '甲級職業安全管理員' },
        aoh: { code: 'aoh', name: '甲級職業衛生管理師' },
        fr: { code: 'fr', name: '急救人員' },
        o2: { code: 'o2', name: '缺氧(侷限)作業主管證照' },
        os: { code: 'os', name: '有機溶劑作業主管證照' },
        sa: { code: 'sa', name: '施工架組配作業主管證照' },
        s: { code: 's', name: '營造作業主管證照' },
        ma: { code: 'ma', name: '作業主管證照' },
        sc: { code: 'sc', name: '特定化學物質作業主管' },
        dw: { code: 'dw', name: '粉塵作業主管' },
        ow: { code: 'ow', name: '氧乙炔熔接裝置作業人員' },
        r: { code: 'r', name: '屋頂作業主管' },
        ssa: { code: 'ssa', name: '鋼構組配作業主管' },
        fs: { code: 'fs', name: '模板支撐作業主管' },
        pe: { code: 'pe', name: '露天開挖作業主管' },
        rs: { code: 'rs', name: '擋土支撐作業主管' },
      };

    // 處理證照資訊
    const certifications: Certification[] = [];

    // 檢查並添加證照
    Object.keys(certificationMap).forEach((code) => {
      const certValue = getFieldValue([certificationMap[code].name, code]);
      if (certValue) {
        // 如果有證照的值，則添加到certifications陣列
        certifications.push({
          type: code as CertificationType,
          name: certificationMap[code].name,
          issue: '', // Excel中可能沒有這些欄位，先設為空
          withdraw: '',
          frontPicture: '',
          backPicture: '',
        });
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
      medicalExamPicture: '',
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
      const existingWorkers = await this.mongodbService.get('worker', {});

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
        this.processStatus = `正在匯入人員資料... (${i + 1}/${
          this.validWorkersToImport.length
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
          this.processStatus = `正在上傳圖片檔案... (${i + 1}/${
            this.validWorkersToImport.length
          })\n目前處理：${worker.name} (${worker.idno})`;
          this.processProgress =
            50 + Math.floor((i / this.validWorkersToImport.length) * 40);

          // 處理該工人的圖片，並取得詳細資訊
          const uploadResult = await this.loadWorkerImagesFromZipWithDetails(
            worker,
            this.zipContent,
            (imageType: string) => {
              this.processStatus = `正在上傳圖片檔案... (${i + 1}/${
                this.validWorkersToImport.length
              })\n目前處理：${worker.name} (${
                worker.idno
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

      // 重新加載資料
      this.workers = await this.mongodbService.get('worker', {});

      // 轉換普通 Worker 為 WorkerWithFlag
      this.workers = this.workers.map((worker) => {
        const workerWithFlag = worker as unknown as WorkerWithFlag;
        workerWithFlag.isValid = signal(true);
        workerWithFlag.certifications =
          worker.certifications as CertificationWithFlag[];
        return workerWithFlag;
      });

      // 檢查意外險或證照是否過期
      for (const worker of this.workers) {
        this.checkWorkerValidity(worker);
      }

      if (this.api) {
        this.api.setGridOption('rowData', this.workers);
      }

      this.processStatus = `匯入完成（新增: ${newCount}, 更新: ${updateCount}${
        imageCount > 0 ? `, 圖片: ${imageCount}` : ''
      }）`;
      this.processProgress = 100;
      this.isCompleted = true; // 標記為已完成

      // 更新匯入結果顯示
      this.importResult = {
        success: true,
        message: `匯入完成！新增 ${newCount} 筆，更新 ${updateCount} 筆${
          imageCount > 0 ? `，上傳 ${imageCount} 張圖片` : ''
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
        `匯入資料時發生錯誤: ${
          error instanceof Error ? error.message : '未知錯誤'
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
      G: { field: 'laborInsurancePicture', name: '勞保證明' },
      H: { field: 'medicalExamPicture', name: '體檢報告' },
    };

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

        // 檢查代碼是否有效
        const imageInfo = imageCodeMap[code.toUpperCase()];
        if (!imageInfo) {
          console.warn(`未知的圖片代碼：${code}，檔案：${fileName}`);
          continue;
        }

        // 更新進度回調
        progressCallback(imageInfo.name);

        try {
          // 讀取圖片檔案
          const fileData = await zipContent.files[filePath].async(
            'arraybuffer'
          );
          const blob = new Blob([fileData], { type: 'image/jpeg' });

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
                workerId: worker._id,
                imageType: imageInfo.field,
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
      G: 'laborInsurancePicture', // 勞保證明（與L相同）
      H: 'medicalExamPicture', // 體檢報告
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
        if (!fieldName) {
          console.warn(`未知的圖片代碼：${code}，檔案：${fileName}`);
          continue;
        }

        try {
          // 讀取圖片檔案
          const fileData = await zipContent.files[filePath].async(
            'arraybuffer'
          );
          const blob = new Blob([fileData], { type: 'image/jpeg' });

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
