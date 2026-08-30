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

/**
 * 執行一個 tool call。
 * @returns {{ content: string, links?: Array<{label: string, url: string}> }}
 *   content 是給 LLM 的 tool message(JSON 字串);links 是 UI 顯示的連結(如許可單表單頁)。
 * 任何錯誤(未知工具、壞 JSON args、DB 失敗)都回 error 字串讓 LLM 自行修正,
 * 絕不 throw —— tool 失敗不能讓整個 chat 500。
 */
async function executeToolCall(siteId, toolCall) {
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
      default:
        return { content: JSON.stringify({ error: `未知的工具:${name}` }) };
    }
    return { content: JSON.stringify(result), links };
  } catch (error) {
    logger.error(`AI tool ${name} 執行失敗:`, error.message);
    return { content: JSON.stringify({ error: `查詢失敗:${error.message}` }) };
  }
}

module.exports = { getToolDefinitions, executeToolCall };
