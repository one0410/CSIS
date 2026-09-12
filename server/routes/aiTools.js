// AI 問答的 tool-calling 工具:查詢工地即時狀態(進度、人員、許可單、基本資料)。
// 查詢口徑全部移植自前端,確保回答數字與 Dashboard 一致:
// - 進度:site-dashboard.component.ts calculateCurrentProgress()
// - 出工人數:worker-count.service.ts extractSeparatedWorkerCounts()
// - 有效許可單:workStartTime/workEndTime 字串區間比較(格式 YYYY-MM-DDTHH:mm)
// siteId 由呼叫端(chat handler)從路徑參數綁定,不進 LLM 的參數 schema。
const { ObjectId } = require('mongodb');
const dayjs = require('dayjs');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
dayjs.extend(isSameOrBefore);
const db = require('../dbConnection');
const logger = require('../logger');

function getToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'get_project_progress',
        description: '查詢本工地目前的工程進度百分比(所有任務進度的平均值,與 Dashboard 的工程進度一致)',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_worker_count',
        description: '查詢本工地的人員數量。today_attendance = 今日實際出工人數(依工具箱會議簽名統計,分主承攬商與各供應商);registered = 在冊工人總數(人才列表,排除訪客);month_total = 當月累積出工人次(逐日去重後加總,依供應商分列)',
        parameters: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['today_attendance', 'registered', 'month_total'],
              description: '統計範圍:today_attendance 今日出工、registered 在冊工人、month_total 當月累積出工人次',
            },
          },
          required: ['scope'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_expected_workforce',
        description: '查詢指定日期(預設明天)的預計出工人數:依工作時間涵蓋該日的施工許可單,按承攬商分組累加施作人數(不含帆宣員工)',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: '查詢日期,格式 YYYY-MM-DD,省略時為明天' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_safety_violations',
        description: '查詢本工地的工安違規/缺失統計(工安缺失記錄表):件數、依供應商分組、依違規代碼分組',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['today', 'this_month'],
              description: '統計期間:today 今日、this_month 當月',
            },
          },
          required: ['period'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_zero_accident_hours',
        description: '查詢本工地的工安零事故時數(從最後一次實際事故或開工日起算,虛驚事件不中斷計時)與最後事故日期',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_equipment_status',
        description: '查詢本工地的機具管理狀態:機具總數、不合格機具數、檢查即將到期(3天內)或已過期的機具數,以及需注意的機具清單',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: '查詢本工地所在地的即時天氣與空氣品質:溫度、濕度、風速、風向、PM2.5、PM10(與 Dashboard 環境監測指標同源)',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    // ── 稽核工具(2026_AI_Audit_RAG_Plan.md P1/P2)──
    {
      type: 'function',
      function: {
        name: 'audit_worker_qualifications',
        description: '稽核:指定日期(預設今天)出工人員是否具備當日特殊作業所需證照。依「同承攬商當日出工者」推定作業人員(許可單無人員名單),逐人給出 符合/不符合/無法判定 與證據。例:「今天做高架作業的人都有高空作業車證照嗎?」',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: '查核日期 YYYY-MM-DD,省略為今天' },
            category: { type: 'string', description: '只查特定作業類別,如「高架作業」「局限空間作業」;省略則查當日全部特殊作業' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_worker_profile',
        description: '查詢本工地在冊工人的個人檔案:所屬公司、在冊/訪客、證照清單(含到期狀態)、本工地與其他工地的違規次數。以姓名或身分證字號查詢。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '工人姓名' },
            idno: { type: 'string', description: '身分證字號(可選,同名多人時用)' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_worker_violations',
        description: '查詢某位工人的工安缺失(違規)記錄。this_site = 本工地明細(日期、缺失代碼、責任單位,附缺失單連結);all_sites = 加上其他工地的違規次數與日期(依隔離規則不揭露他站內容)。例:「張三在其他工地違規過幾次?」',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '工人姓名' },
            idno: { type: 'string', description: '身分證字號(可選)' },
            scope: { type: 'string', enum: ['this_site', 'all_sites'], description: '範圍:this_site 本工地、all_sites 含其他工地' },
          },
          required: ['scope'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'audit_expiring_certifications',
        description: '稽核:列出本工地在冊工人中,證照已過期或將於 N 天內到期者(預設 30 天)',
        parameters: {
          type: 'object',
          properties: { days: { type: 'integer', description: '到期門檻天數,預設 30' } },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'audit_permit_coverage',
        description: '稽核:指定日期(預設今天)有出工簽到但沒有有效施工許可單的承攬商。例:「今天有沒有人沒許可單就進場?」',
        parameters: {
          type: 'object',
          properties: { date: { type: 'string', description: '查核日期 YYYY-MM-DD,省略為今天' } },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_active_permits',
        description: '查詢指定日期(預設今天)有效的工地許可單(施工申請單),回傳張數與每張的承攬商、作業時間、人數、作業類別摘要',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: '查詢日期,格式 YYYY-MM-DD,省略時為今天' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_site_info',
        description: '查詢本工地的基本資料:專案名稱、專案編號、工期起訖日期、所在縣市、廠區、作業類型',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ];
}

// --- 各工具實作 -------------------------------------------------------------

async function getProjectProgress(siteId) {
  const tasks = await db.collection('task').find({ siteId }).toArray();
  if (!tasks.length) {
    return { 工程進度百分比: 0, 說明: '本工地尚未匯入任何進度任務' };
  }

  const today = new Date();
  let totalProgress = 0;
  let taskCount = 0;
  for (const task of tasks) {
    if (task.progressHistory && task.progressHistory.length > 0) {
      const sorted = [...task.progressHistory].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      let taskProgress = 0;
      for (const record of sorted) {
        if (new Date(record.date) <= today) taskProgress = record.progress;
        else break;
      }
      totalProgress += taskProgress;
      taskCount++;
    } else if (task.progress !== undefined) {
      totalProgress += task.progress;
      taskCount++;
    }
  }
  const percent = taskCount > 0 ? Math.round((totalProgress / taskCount) * 10) / 10 : 0;
  return { 工程進度百分比: percent, 任務總數: tasks.length };
}

async function getWorkerCount(siteId, scope) {
  if (scope === 'registered') {
    const workers = await db
      .collection('worker')
      .find({ belongSites: { $elemMatch: { siteId } } })
      .project({ belongSites: 1 })
      .toArray();
    // 排除該工地標記為訪客者
    const count = workers.filter(w => {
      const belong = (w.belongSites || []).find(b => b.siteId === siteId);
      return belong && !belong.isVisitor;
    }).length;
    return { 在冊工人數: count };
  }

  // today_attendance:今日工具箱會議簽名,主承攬商/供應商分開,姓名去重
  const today = dayjs().format('YYYY-MM-DD');
  const meetings = await db
    .collection('siteForm')
    .find({ siteId, formType: 'toolboxMeeting', applyDate: today })
    .toArray();

  const mainContractorWorkers = new Set();
  const supplierCounts = new Map();
  for (const meeting of meetings) {
    const hw = meeting.healthWarnings;
    if (!hw) continue;
    for (const sig of hw.attendeeMainContractorSignatures || []) {
      if (sig && sig.name && sig.signature) mainContractorWorkers.add(sig.name);
    }
    const subArrays = [
      hw.attendeeSubcontractor1Signatures || [],
      hw.attendeeSubcontractor2Signatures || [],
      hw.attendeeSubcontractor3Signatures || [],
    ];
    for (const signatures of subArrays) {
      for (const sig of signatures) {
        if (sig && sig.name && sig.signature && sig.company) {
          const company = sig.company.trim();
          if (!supplierCounts.has(company)) supplierCounts.set(company, new Set());
          supplierCounts.get(company).add(sig.name);
        }
      }
    }
  }

  const 供應商明細 = {};
  let supplierTotal = 0;
  for (const [company, workers] of supplierCounts) {
    供應商明細[company] = workers.size;
    supplierTotal += workers.size;
  }
  return {
    日期: today,
    今日出工總人數: mainContractorWorkers.size + supplierTotal,
    主承攬商人數: mainContractorWorkers.size,
    供應商總人數: supplierTotal,
    供應商明細,
    說明: meetings.length === 0 ? '今日尚無工具箱會議簽到記錄' : undefined,
  };
}

async function getActivePermits(siteId, date) {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dayjs().format('YYYY-MM-DD');
  // 與 Dashboard 相同口徑:workStartTime/workEndTime 為 YYYY-MM-DDTHH:mm 字串,直接字串比較
  const permits = await db
    .collection('siteForm')
    .find({
      siteId,
      formType: 'sitePermit',
      workStartTime: { $lte: `${day}T23:59` },
      workEndTime: { $gte: `${day}T00:00` },
    })
    .toArray();

  const 許可單摘要 = permits.map(p => {
    const item = {
      承攬商: p.contractor,
      作業開始: p.workStartTime,
      作業結束: p.workEndTime,
      作業人數: p.workPersonCount,
      作業類別: Array.isArray(p.selectedCategories) && p.selectedCategories.length > 0
        ? p.selectedCategories
        : (p.isGeneralWork ? ['一般作業'] : undefined),
      作業內容: p.workContent,
      作業地點: p.workLocation,
    };
    // 移除 undefined 欄位,減少 token
    Object.keys(item).forEach(k => item[k] === undefined && delete item[k]);
    return item;
  });

  // UI 用的表單連結(不進 LLM content):點擊開該張許可單的檢視頁
  const links = permits.map(p => ({
    label: `${(p.workStartTime || '').slice(0, 10)} ${p.contractor || ''} 施工許可單`.trim(),
    url: `/site/${siteId}/forms/permit/${p._id}`,
  }));

  return { result: { 日期: day, 有效許可單數: permits.length, 許可單摘要 }, links };
}

async function getSiteInfo(siteId) {
  const site = await db.collection('site').findOne(
    { _id: new ObjectId(siteId) },
    // image/formLogo 是 base64 大欄位,絕不能進 LLM context
    { projection: { image: 0, formLogo: 0 } }
  );
  if (!site) return { error: '找不到工地資料' };

  // 工期天數口徑同 Dashboard:總天數含頭尾;已進行天數以工期結束日為上限。
  // 用 dayjs 的日曆日 diff(floor 語意)避免 new Date('yyyy-mm-dd') 的 UTC 午夜偏移
  // 讓夜間比 Dashboard 多算一天(Dashboard 亦為 floor)。
  let 工期總天數;
  let 已進行天數;
  if (site.startDate && site.endDate) {
    const start = dayjs(site.startDate);
    const end = dayjs(site.endDate);
    工期總天數 = end.diff(start, 'day') + 1;
    const today = dayjs();
    const clamped = today.isAfter(end) ? end : today;
    已進行天數 = Math.max(0, clamped.diff(start, 'day') + 1);
  }

  return {
    專案編號: site.projectNo,
    專案名稱: site.projectName,
    工期開始: site.startDate,
    工期結束: site.endDate,
    工期總天數,
    已進行天數,
    縣市: site.county,
    鄉鎮市區: site.town,
    廠區: site.factories,
    作業類型: site.constructionTypes,
    今天日期: dayjs().format('YYYY-MM-DD'),
  };
}

// 明日(或指定日)預計出工:涵蓋該日的許可單依承攬商分組累加 workPersonCount
// —— 口徑同 Dashboard「明日預計出工狀況」卡(不含帆宣員工,許可單無此資料)
async function getExpectedWorkforce(siteId, date) {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : dayjs().add(1, 'day').format('YYYY-MM-DD');
  const permits = await db
    .collection('siteForm')
    .find({
      siteId,
      formType: 'sitePermit',
      workStartTime: { $lte: `${day}T23:59` },
      workEndTime: { $gte: `${day}T00:00` },
    })
    .project({ contractor: 1, workPersonCount: 1 })
    .toArray();

  const byContractor = {};
  let total = 0;
  for (const p of permits) {
    const name = (p.contractor || '未填承攬商').trim();
    const n = Number(p.workPersonCount) || 0;
    byContractor[name] = (byContractor[name] || 0) + n;
    total += n;
  }
  return {
    日期: day,
    預計出工總人數: total,
    各承攬商: byContractor,
    許可單數: permits.length,
    說明: '依施工許可單的施作人數統計,不含帆宣員工',
  };
}

// 當月累積出工人次:逐日(toolboxMeeting 簽名,公司+姓名去重)加總
// —— 口徑同 Dashboard「每月累積出工人數」「當月各供應商累積出工人數」卡
async function getMonthWorkerTotal(siteId) {
  const start = dayjs().startOf('month').format('YYYY-MM-DD');
  const end = dayjs().endOf('month').format('YYYY-MM-DD');
  const meetings = await db
    .collection('siteForm')
    .find({ siteId, formType: 'toolboxMeeting', applyDate: { $gte: start, $lte: end } })
    .project({ applyDate: 1, healthWarnings: 1 })
    .toArray();

  // 依日分組 → 每日各公司姓名去重 → 逐日人數加總
  const byDay = new Map();
  for (const m of meetings) {
    if (!byDay.has(m.applyDate)) byDay.set(m.applyDate, []);
    byDay.get(m.applyDate).push(m);
  }
  const companyTotals = {};
  let grandTotal = 0;
  for (const [, dayMeetings] of byDay) {
    const dayCompanies = new Map(); // company -> Set<name>
    for (const meeting of dayMeetings) {
      const hw = meeting.healthWarnings;
      if (!hw) continue;
      const arrays = [
        hw.attendeeMainContractorSignatures || [],
        hw.attendeeSubcontractor1Signatures || [],
        hw.attendeeSubcontractor2Signatures || [],
        hw.attendeeSubcontractor3Signatures || [],
      ];
      for (const signatures of arrays) {
        for (const sig of signatures) {
          if (sig && sig.name && sig.signature && sig.company) {
            const company = sig.company.trim();
            if (!dayCompanies.has(company)) dayCompanies.set(company, new Set());
            dayCompanies.get(company).add(sig.name);
          }
        }
      }
    }
    for (const [company, names] of dayCompanies) {
      companyTotals[company] = (companyTotals[company] || 0) + names.size;
      grandTotal += names.size;
    }
  }
  return {
    月份: dayjs().format('YYYY-MM'),
    當月累積出工人次: grandTotal,
    各公司累積人次: companyTotals,
    有出工天數: byDay.size,
  };
}

// 工安違規/缺失統計(safetyIssueRecord,排除已撤銷)
// —— 口徑同 Dashboard 違規統計圖表:供應商依 responsibleUnit/supplierName,類別依 deductionCode
async function getSafetyViolations(siteId, period) {
  const isMonth = period === 'this_month';
  const start = isMonth ? dayjs().startOf('month').format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
  const end = isMonth ? dayjs().endOf('month').format('YYYY-MM-DD') : start;
  const records = await db
    .collection('siteForm')
    .find({
      siteId,
      formType: 'safetyIssueRecord',
      status: { $ne: 'revoked' },
      issueDate: { $gte: start, $lte: end },
    })
    .project({ responsibleUnit: 1, supplierName: 1, deductionCode: 1, issueDate: 1 })
    .toArray();

  const bySupplier = {};
  const byCode = {};
  for (const r of records) {
    if (r.responsibleUnit === 'supplier' && r.supplierName?.trim()) {
      const name = r.supplierName.trim();
      bySupplier[name] = (bySupplier[name] || 0) + 1;
    }
    if (r.deductionCode?.trim()) {
      const code = r.deductionCode.trim();
      byCode[code] = (byCode[code] || 0) + 1;
    }
  }
  return {
    期間: isMonth ? dayjs().format('YYYY-MM') : start,
    違規總件數: records.length,
    各供應商違規次數: bySupplier,
    各違規代碼次數: byCode,
  };
}

// 零事故時數:最後一次「實際事故」(排除虛驚 near_miss)或開工日起算
// —— 口徑同 Dashboard zero-accident-hours 元件
async function getZeroAccidentHours(siteId) {
  const accidents = await db
    .collection('accident')
    .find({ siteId, category: { $ne: 'near_miss' } })
    .sort({ incidentDate: -1, incidentTime: -1 })
    .limit(1)
    .toArray();

  let referenceDate = null;
  let lastAccident = null;
  const latest = accidents[0];
  if (latest?.incidentDate) {
    const dateStr = dayjs(latest.incidentDate).format('YYYY-MM-DD');
    const timeStr = /^\d{2}:\d{2}$/.test(latest.incidentTime || '') ? latest.incidentTime : '00:00';
    const d = new Date(`${dateStr}T${timeStr}:00`);
    if (!isNaN(d.getTime())) {
      referenceDate = d;
      lastAccident = { 日期: dateStr, 時間: timeStr, 類別: latest.category };
    }
  }
  if (!referenceDate) {
    const site = await db.collection('site').findOne(
      { _id: new ObjectId(siteId) },
      { projection: { startDate: 1 } }
    );
    if (site?.startDate) referenceDate = new Date(site.startDate);
  }
  if (!referenceDate || isNaN(referenceDate.getTime())) {
    return { error: '無事故記錄且工地無開工日期,無法計算零事故時數' };
  }
  const hours = Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / 3600000));
  return {
    零事故時數: hours,
    約當天數: Math.floor(hours / 24),
    最後事故: lastAccident || '無實際事故記錄(從開工日起算)',
  };
}

// 機具狀態:不合格 + 檢查即將到期(3天內)/已過期
// —— 口徑同 current-site.service 的 disqualified/expiring 計算(含 nextInspectionType 週期推算)
function nextInspectionDateOf(eq) {
  if (eq.nextInspectionDate) return dayjs(eq.nextInspectionDate);
  if (eq.inspectionDate && eq.nextInspectionType && eq.nextInspectionType !== 'custom') {
    const base = dayjs(eq.inspectionDate);
    switch (eq.nextInspectionType) {
      case 'weekly': return base.add(7, 'day');
      case 'monthly': return base.add(1, 'month');
      case 'quarterly': return base.add(3, 'month');
      case 'biannual': return base.add(6, 'month');
      case 'yearly': return base.add(1, 'year');
      default: return null;
    }
  }
  return null;
}

async function getEquipmentStatus(siteId) {
  const equipment = await db
    .collection('equipment')
    .find({ siteId })
    .project({ name: 1, isQualified: 1, inspectionDate: 1, nextInspectionDate: 1, nextInspectionType: 1 })
    .toArray();

  // 口徑同 current-site.service:nextDate.isSameOrBefore(今天+3天),以日曆日比較
  const threeDaysLater = dayjs().add(3, 'day');
  const disqualified = [];
  const expiring = [];
  for (const eq of equipment) {
    if (eq.isQualified === false && eq.inspectionDate !== undefined) {
      disqualified.push(eq.name || '(未命名機具)');
    }
    const next = nextInspectionDateOf(eq);
    if (next && next.isSameOrBefore(threeDaysLater, 'day')) {
      expiring.push(`${eq.name || '(未命名機具)'}(下次檢查 ${next.format('YYYY-MM-DD')})`);
    }
  }
  return {
    機具總數: equipment.length,
    不合格機具數: disqualified.length,
    不合格機具: disqualified,
    檢查到期或即將到期數: expiring.length,
    檢查到期或即將到期: expiring,
    說明: '「即將到期」= 下次檢查日在 3 天內(含已過期)',
  };
}

// 即時天氣與空品(WeatherAPI,與前端 weather.service 同 key 同口徑)
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'f60ed37e061d456194f100016251005';
const COUNTY_TO_QUERY = {
  臺北市: 'Taipei', 台北市: 'Taipei', 新北市: 'New Taipei City', 桃園市: 'Taoyuan',
  臺中市: 'Taichung', 台中市: 'Taichung', 臺南市: 'Tainan', 台南市: 'Tainan',
  高雄市: 'Kaohsiung', 基隆市: 'Keelung', 新竹市: 'Hsinchu', 嘉義市: 'Chiayi',
  新竹縣: 'Hsinchu County', 苗栗縣: 'Miaoli', 彰化縣: 'Changhua', 南投縣: 'Nantou',
  雲林縣: 'Yunlin', 嘉義縣: 'Chiayi County', 屏東縣: 'Pingtung', 宜蘭縣: 'Yilan',
  花蓮縣: 'Hualien', 臺東縣: 'Taitung', 台東縣: 'Taitung', 澎湖縣: 'Penghu',
  金門縣: 'Kinmen', 連江縣: 'Lienchiang',
};

async function getWeather(siteId) {
  const site = await db.collection('site').findOne(
    { _id: new ObjectId(siteId) },
    { projection: { county: 1 } }
  );
  const county = site?.county || '';
  const query = COUNTY_TO_QUERY[county] || 'Taipei';

  const resp = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(query)}&aqi=yes`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!resp.ok) return { error: `天氣服務回應 ${resp.status}` };
  const data = await resp.json();
  const c = data.current || {};
  const pm25 = c.air_quality?.pm2_5 != null ? Math.round(c.air_quality.pm2_5 * 10) / 10 : null;
  const pm10 = c.air_quality?.pm10 != null ? Math.round(c.air_quality.pm10 * 10) / 10 : null;
  return {
    地區: county || query,
    溫度C: c.temp_c,
    濕度百分比: c.humidity,
    風速kph: c.wind_kph,
    風向: c.wind_dir,
    PM25: pm25,
    PM10: pm10,
    天氣描述: c.condition?.text,
    // Dashboard 警戒標準,供 LLM 判讀
    警戒標準: 'PM2.5 >35 注意/>75 危險;PM10 >50 注意/>100 危險',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 稽核工具(2026_AI_Audit_RAG_Plan.md)
// ═══════════════════════════════════════════════════════════════════════════

// 作業類別 → 應具證照對照(P0 草案,待帆宣確認後改為正式規則;未列出的類別回「無法判定」)
// rule: 'each' = 該類別作業的每位出工者都應持證;'supervisor' = 該承攬商當日出工者中至少一人持證(作業主管制)
const CATEGORY_CERT_RULES = {
  '高架作業': { certTypes: ['a'], rule: 'each' },
  '局限空間作業': { certTypes: ['o2'], rule: 'supervisor' },
  '施工架組裝作業': { certTypes: ['sa'], rule: 'supervisor' },
  '動火作業': { certTypes: ['ow'], rule: 'each' },
};
const CERT_NAMES = {
  a: '高空作業車操作人員', bosh: '乙級職業安全管理員', aos: '甲級職業安全管理師', aoh: '甲級職業衛生管理師',
  fr: '急救人員', o2: '缺氧(局限)作業主管', os: '有機溶劑作業主管', sa: '施工架組配作業主管',
  s: '營造業職業安全衛生業務主管', ma: '一般業職業安全衛生業務主管', sc: '特定化學物質作業主管',
  dw: '粉塵作業主管', ow: '氧乙炔熔接裝置作業人員', r: '屋頂作業主管', ssa: '鋼構組配作業主管',
  fs: '模板支撐作業主管', pe: '露天開挖作業主管', rs: '擋土支撐作業主管',
};
const certLabel = c => CERT_NAMES[c.type] || c.name || c.type;

// belongSites 混有字串與 {siteId} 兩種形式,查詢須兼容
const siteMemberFilter = siteId => ({ $or: [{ 'belongSites.siteId': siteId }, { belongSites: siteId }] });
const isVisitorAt = (w, siteId) =>
  (w.belongSites || []).some(b => b && typeof b === 'object' && b.siteId === siteId && b.isVisitor);
const WORKER_PROJECTION = { name: 1, idno: 1, contractingCompanyName: 1, certifications: 1, belongSites: 1, safetyIssues: 1 };
const dayOf = (s, fallback) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback);

// 以姓名或身分證字號在「本工地在冊」中找工人;同名多人且無 idno → 回候選讓 LLM 反問
async function findWorkerInSite(siteId, { name, idno }) {
  const col = db.collection('worker');
  if (idno) {
    const w = await col.findOne({ ...siteMemberFilter(siteId), idno: idno.trim().toUpperCase() }, { projection: WORKER_PROJECTION });
    return { worker: w, candidates: [] };
  }
  if (!name) return { worker: null, candidates: [] };
  const list = await col.find({ ...siteMemberFilter(siteId), name: name.trim() }).project(WORKER_PROJECTION).toArray();
  if (list.length === 1) return { worker: list[0], candidates: [] };
  return { worker: null, candidates: list };
}

// 當日出工者:工具箱會議簽到(主承攬商/供應商分列),依 idno 或 姓名+公司 去重
async function getAttendees(siteId, day) {
  const meetings = await db
    .collection('siteForm')
    .find({ siteId, formType: 'toolboxMeeting', applyDate: day })
    .project({ healthWarnings: 1 })
    .toArray();
  const seen = new Map();
  for (const m of meetings) {
    const hw = m.healthWarnings;
    if (!hw) continue;
    const groups = [
      [hw.attendeeMainContractorSignatures || [], true],
      [hw.attendeeSubcontractor1Signatures || [], false],
      [hw.attendeeSubcontractor2Signatures || [], false],
      [hw.attendeeSubcontractor3Signatures || [], false],
    ];
    for (const [sigs, isMain] of groups) {
      for (const s of sigs) {
        if (!s || !s.name || !s.signature) continue;
        const company = (s.company || '').trim();
        const idno = (s.idno || '').trim().toUpperCase();
        const key = idno || `${s.name.trim()}@${company}`;
        if (!seen.has(key)) seen.set(key, { name: s.name.trim(), company, idno, isMain });
      }
    }
  }
  return [...seen.values()];
}

async function permitsCovering(siteId, day) {
  return db
    .collection('siteForm')
    .find({ siteId, formType: 'sitePermit', workStartTime: { $lte: `${day}T23:59` }, workEndTime: { $gte: `${day}T00:00` } })
    .project({ contractor: 1, selectedCategories: 1, isGeneralWork: 1, isSpecialWork: 1, workStartTime: 1, workContent: 1 })
    .toArray();
}

const validCertOn = (cert, day) => !!cert && (!cert.withdraw || cert.withdraw >= day);

async function auditWorkerQualifications(siteId, date, category) {
  const day = dayOf(date, dayjs().format('YYYY-MM-DD'));
  const [attendees, permits] = await Promise.all([getAttendees(siteId, day), permitsCovering(siteId, day)]);
  if (!attendees.length) {
    return { result: { 日期: day, 判定: '無法判定', 說明: '當日無工具箱會議簽到記錄,無出工名單可稽核' }, links: [] };
  }

  // 承攬商 → 當日特殊作業類別
  const catsByContractor = new Map();
  for (const p of permits) {
    const cats = Array.isArray(p.selectedCategories) ? p.selectedCategories.filter(Boolean) : [];
    if (!cats.length) continue; // 一般作業不需特殊證照
    const c = (p.contractor || '').trim();
    if (!catsByContractor.has(c)) catsByContractor.set(c, new Set());
    cats.forEach(x => catsByContractor.get(c).add(x));
  }
  if (category) {
    for (const [c, set] of catsByContractor) {
      const kept = [...set].filter(x => x.includes(category) || category.includes(x));
      if (kept.length) catsByContractor.set(c, new Set(kept)); else catsByContractor.delete(c);
    }
  }
  if (!catsByContractor.size) {
    return { result: { 日期: day, 判定: '無需稽核', 說明: category ? `當日無「${category}」許可單` : '當日無特殊作業許可單' }, links: [] };
  }

  // 一次撈出簽到者對應的工人(idno 優先,姓名為輔)
  const idnos = attendees.map(a => a.idno).filter(Boolean);
  const names = attendees.map(a => a.name);
  const workers = await db
    .collection('worker')
    .find({ ...siteMemberFilter(siteId), $or: [{ idno: { $in: idnos } }, { name: { $in: names } }] })
    .project(WORKER_PROJECTION)
    .toArray();
  const matchWorker = a => {
    if (a.idno) return workers.find(w => (w.idno || '').toUpperCase() === a.idno) || null;
    const byName = workers.filter(w => w.name === a.name);
    if (byName.length === 1) return byName[0];
    return byName.find(w => (w.contractingCompanyName || '').trim() === a.company) || null;
  };

  const 明細 = [];
  const links = [];
  const counts = { 符合: 0, 不符合: 0, 無法判定: 0 };
  for (const [contractor, cats] of catsByContractor) {
    const crew = attendees.filter(a => !a.isMain && a.company === contractor);
    for (const cat of cats) {
      const rule = CATEGORY_CERT_RULES[cat];
      if (!crew.length) {
        明細.push({ 承攬商: contractor, 作業類別: cat, 判定: '無法判定', 原因: '該承攬商當日無出工簽到記錄' });
        counts['無法判定']++;
        continue;
      }
      if (!rule) {
        明細.push({ 承攬商: contractor, 作業類別: cat, 判定: '無法判定', 原因: '此作業類別尚未定義應具證照(待對照表確認)', 出工人數: crew.length });
        counts['無法判定']++;
        continue;
      }
      const need = rule.certTypes.map(t => CERT_NAMES[t]).join('/');
      const rows = crew.map(a => {
        const w = matchWorker(a);
        if (!w) return { 姓名: a.name, 公司: contractor, 作業類別: cat, 應具證照: need, 判定: '無法判定', 原因: '人才名冊查無此人(簽到未填身分證字號或姓名不符)' };
        const certs = (w.certifications || []).filter(c => rule.certTypes.includes(c.type));
        const valid = certs.filter(c => validCertOn(c, day));
        const expired = certs.filter(c => !validCertOn(c, day));
        const row = { 姓名: a.name, 公司: contractor, 作業類別: cat, 應具證照: need, _wid: w._id };
        if (valid.length) return { ...row, 判定: '符合', 持有證照: valid.map(c => `${certLabel(c)}(至 ${c.withdraw || '無到期日'})`).join('、') };
        if (expired.length) return { ...row, 判定: '不符合', 原因: `證照已過期(${expired.map(c => c.withdraw).join('、')})` };
        return { ...row, 判定: '不符合', 原因: '無此類證照' };
      });
      if (rule.rule === 'supervisor') {
        const anyOk = rows.some(r => r.判定 === '符合');
        for (const r of rows) {
          if (r.判定 === '無法判定') continue;
          r.判定 = anyOk ? '符合' : '不符合';
          r.規則 = '作業主管制:承攬商當日出工者至少一人持證';
          if (anyOk) delete r.原因;
        }
      }
      for (const r of rows) {
        counts[r.判定]++;
        if (r._wid && r.判定 !== '符合') links.push({ label: `${r.姓名} 人員資料`, url: `/worker/${r._wid}` });
        delete r._wid;
        明細.push(r);
      }
    }
  }
  for (const p of permits) {
    if (Array.isArray(p.selectedCategories) && p.selectedCategories.length) {
      links.push({ label: `${(p.workStartTime || '').slice(0, 10)} ${p.contractor || ''} 施工許可單`.trim(), url: `/site/${siteId}/forms/permit/${p._id}` });
    }
  }
  const 判定 = counts['不符合'] ? '不符合' : counts['無法判定'] && !counts['符合'] ? '無法判定' : '符合';
  return {
    result: {
      日期: day,
      整體判定: 判定,
      判定總結: counts,
      推定依據: '許可單無作業人員名單,以「同承攬商當日出工簽到者」推定為該作業人員;證照對照規則為草案',
      明細,
    },
    links: dedupeLinks(links),
  };
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter(l => (seen.has(l.url) ? false : (seen.add(l.url), true)));
}

function summarizeViolations(w, siteId) {
  const issues = w.safetyIssues || [];
  const here = issues.filter(i => i.siteId === siteId);
  const other = issues.filter(i => i.siteId && i.siteId !== siteId);
  return {
    here,
    other,
    本工地違規次數: here.length,
    其他工地違規次數: other.length,
    其他工地數: new Set(other.map(i => i.siteId)).size,
    其他工地違規日期: other.map(i => i.issueDate).filter(Boolean).sort(),
  };
}

function candidatesResult(candidates, name) {
  if (!candidates.length) return { error: `本工地在冊人員中查無「${name || ''}」,請確認姓名或提供身分證字號` };
  return {
    無法判定: `本工地有 ${candidates.length} 位同名「${name}」,請提供身分證字號或指定公司`,
    候選: candidates.map(w => ({ 姓名: w.name, 公司: w.contractingCompanyName || '' })),
  };
}

async function getWorkerProfile(siteId, args) {
  const { worker: w, candidates } = await findWorkerInSite(siteId, args);
  if (!w) return { result: candidatesResult(candidates, args.name), links: [] };
  const today = dayjs().format('YYYY-MM-DD');
  const v = summarizeViolations(w, siteId);
  return {
    result: {
      姓名: w.name,
      公司: w.contractingCompanyName || '',
      在冊狀態: isVisitorAt(w, siteId) ? '訪客' : '在冊',
      證照: (w.certifications || []).map(c => ({
        證照: certLabel(c),
        到期日: c.withdraw || '未填',
        狀態: validCertOn(c, today) ? '有效' : '已過期',
      })),
      本工地違規次數: v.本工地違規次數,
      其他工地違規次數: v.其他工地違規次數,
      其他工地數: v.其他工地數,
      說明: '其他工地僅提供次數(隔離規則);明細請用 get_worker_violations',
    },
    links: [{ label: `${w.name} 人員資料`, url: `/worker/${w._id}` }],
  };
}

async function getWorkerViolations(siteId, args) {
  const { worker: w, candidates } = await findWorkerInSite(siteId, args);
  if (!w) return { result: candidatesResult(candidates, args.name), links: [] };
  const v = summarizeViolations(w, siteId);
  const formIds = v.here.map(i => i.formId).filter(Boolean).map(id => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean);
  const forms = formIds.length
    ? await db.collection('siteForm').find({ _id: { $in: formIds }, siteId }).project({ issueDate: 1, deductionCode: 1, responsibleUnit: 1, supplierName: 1, issueDescription: 1, recordPoints: 1, status: 1 }).toArray()
    : [];
  const 本工地明細 = forms.map(f => ({
    日期: f.issueDate,
    缺失代碼: f.deductionCode || '',
    責任單位: f.responsibleUnit === 'supplier' ? (f.supplierName || '供應商') : (f.responsibleUnit || ''),
    記點: f.recordPoints || '',
    說明: (f.issueDescription || '').slice(0, 120),
    狀態: f.status || '',
  }));
  const result = { 姓名: w.name, 公司: w.contractingCompanyName || '', 本工地違規次數: v.本工地違規次數, 本工地明細 };
  if (args.scope === 'all_sites') {
    result.其他工地違規次數 = v.其他工地違規次數;
    result.其他工地數 = v.其他工地數;
    result.其他工地違規日期 = v.其他工地違規日期;
    result.說明 = '依工地隔離規則,其他工地僅提供次數與日期,不揭露缺失內容';
  }
  const links = forms.map(f => ({ label: `${f.issueDate} 工安缺失紀錄單`, url: `/site/${siteId}/forms/safety-issue-record/${f._id}` }));
  links.push({ label: `${w.name} 人員資料`, url: `/worker/${w._id}` });
  return { result, links };
}

async function auditExpiringCertifications(siteId, days) {
  const n = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 30;
  const today = dayjs();
  const limit = today.add(n, 'day').format('YYYY-MM-DD');
  const workers = await db.collection('worker').find(siteMemberFilter(siteId)).project(WORKER_PROJECTION).toArray();
  const rows = [];
  const links = [];
  for (const w of workers) {
    if (isVisitorAt(w, siteId)) continue;
    for (const c of w.certifications || []) {
      if (!c.withdraw || c.withdraw > limit) continue;
      const d = dayjs(c.withdraw).diff(today, 'day');
      rows.push({ 姓名: w.name, 公司: w.contractingCompanyName || '', 證照: certLabel(c), 到期日: c.withdraw, 狀態: d < 0 ? `已過期 ${-d} 天` : `${d} 天後到期` });
      if (links.length < 20) links.push({ label: `${w.name} 人員資料`, url: `/worker/${w._id}` });
    }
  }
  rows.sort((a, b) => a.到期日.localeCompare(b.到期日));
  return { result: { 門檻天數: n, 在冊工人數: workers.length, 到期或即將到期件數: rows.length, 明細: rows }, links: dedupeLinks(links) };
}

async function auditPermitCoverage(siteId, date) {
  const day = dayOf(date, dayjs().format('YYYY-MM-DD'));
  const [attendees, permits] = await Promise.all([getAttendees(siteId, day), permitsCovering(siteId, day)]);
  const permitted = new Set(permits.map(p => (p.contractor || '').trim()).filter(Boolean));
  const byCompany = new Map();
  let mainCount = 0;
  for (const a of attendees) {
    if (a.isMain) { mainCount++; continue; }
    byCompany.set(a.company, (byCompany.get(a.company) || 0) + 1);
  }
  const 缺許可單 = [...byCompany].filter(([c]) => !permitted.has(c)).map(([c, n]) => ({ 承攬商: c || '(未填公司)', 出工人數: n }));
  const 有許可單 = [...byCompany].filter(([c]) => permitted.has(c)).map(([c, n]) => ({ 承攬商: c, 出工人數: n }));
  const links = permits.map(p => ({ label: `${day} ${p.contractor || ''} 施工許可單`.trim(), url: `/site/${siteId}/forms/permit/${p._id}` }));
  return {
    result: {
      日期: day,
      整體判定: !attendees.length ? '無法判定(當日無簽到記錄)' : 缺許可單.length ? '不符合' : '符合',
      有出工且有許可單: 有許可單,
      有出工但無許可單: 缺許可單,
      主承攬商出工人數: mainCount,
      說明: '以工具箱會議簽到公司名稱與許可單承攬商名稱比對(名稱需一致)',
    },
    links: dedupeLinks(links),
  };
}

// 稽核留痕:每次工具呼叫寫 ai_tool_audit(對應規格書「權限判定紀錄留存」),失敗不影響回答
async function logToolAudit(siteId, ctx, name, args, crossSite) {
  try {
    await db.collection('ai_tool_audit').insertOne({
      siteId, sessionId: ctx?.sessionId || null, userId: ctx?.userId || null,
      tool: name, args, crossSite: !!crossSite, at: new Date(),
    });
  } catch (e) {
    logger.warn(`ai_tool_audit 寫入失敗: ${e.message}`);
  }
}

/**
 * 執行一個 tool call。
 * @returns {{ content: string, links?: Array<{label: string, url: string}> }}
 *   content 是給 LLM 的 tool message(JSON 字串);links 是 UI 顯示的連結(如許可單表單頁)。
 * 任何錯誤(未知工具、壞 JSON args、DB 失敗)都回 error 字串讓 LLM 自行修正,
 * 絕不 throw —— tool 失敗不能讓整個 chat 500。
 */
async function executeToolCall(siteId, toolCall, ctx = {}) {
  const name = toolCall?.function?.name;
  let args = {};
  try {
    if (toolCall?.function?.arguments) args = JSON.parse(toolCall.function.arguments);
  } catch {
    return { content: JSON.stringify({ error: '工具參數不是合法 JSON,請修正後重試' }) };
  }

  try {
    let result;
    let links;
    switch (name) {
      case 'get_project_progress':
        result = await getProjectProgress(siteId);
        break;
      case 'get_worker_count':
        if (args.scope === 'month_total') {
          result = await getMonthWorkerTotal(siteId);
        } else {
          result = await getWorkerCount(siteId, args.scope === 'registered' ? 'registered' : 'today_attendance');
        }
        break;
      case 'get_active_permits': {
        const r = await getActivePermits(siteId, args.date);
        result = r.result;
        links = r.links;
        break;
      }
      case 'get_site_info':
        result = await getSiteInfo(siteId);
        break;
      case 'get_expected_workforce':
        result = await getExpectedWorkforce(siteId, args.date);
        break;
      case 'get_safety_violations':
        result = await getSafetyViolations(siteId, args.period === 'this_month' ? 'this_month' : 'today');
        break;
      case 'get_zero_accident_hours':
        result = await getZeroAccidentHours(siteId);
        break;
      case 'get_equipment_status':
        result = await getEquipmentStatus(siteId);
        break;
      case 'get_weather':
        result = await getWeather(siteId);
        break;
      case 'audit_worker_qualifications': {
        const r = await auditWorkerQualifications(siteId, args.date, args.category);
        result = r.result; links = r.links;
        break;
      }
      case 'get_worker_profile': {
        const r = await getWorkerProfile(siteId, args);
        result = r.result; links = r.links;
        break;
      }
      case 'get_worker_violations': {
        const r = await getWorkerViolations(siteId, { ...args, scope: args.scope === 'all_sites' ? 'all_sites' : 'this_site' });
        result = r.result; links = r.links;
        break;
      }
      case 'audit_expiring_certifications': {
        const r = await auditExpiringCertifications(siteId, args.days);
        result = r.result; links = r.links;
        break;
      }
      case 'audit_permit_coverage': {
        const r = await auditPermitCoverage(siteId, args.date);
        result = r.result; links = r.links;
        break;
      }
      default:
        return { content: JSON.stringify({ error: `未知的工具:${name}` }) };
    }
    const crossSite = name === 'get_worker_violations' && args.scope === 'all_sites';
    logToolAudit(siteId, ctx, name, args, crossSite || name === 'get_worker_profile');
    return { content: JSON.stringify(result), links };
  } catch (error) {
    logger.error(`AI tool ${name} 執行失敗:`, error.message);
    return { content: JSON.stringify({ error: `查詢失敗:${error.message}` }) };
  }
}

module.exports = { getToolDefinitions, executeToolCall };
