// AI 問答的 tool-calling 工具:查詢工地即時狀態(進度、人員、許可單、基本資料)。
// 查詢口徑全部移植自前端,確保回答數字與 Dashboard 一致:
// - 進度:site-dashboard.component.ts calculateCurrentProgress()
// - 出工人數:worker-count.service.ts extractSeparatedWorkerCounts()
// - 有效許可單:workStartTime/workEndTime 字串區間比較(格式 YYYY-MM-DDTHH:mm)
// siteId 由呼叫端(chat handler)從路徑參數綁定,不進 LLM 的參數 schema。
const { ObjectId } = require('mongodb');
const dayjs = require('dayjs');
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
        description: '查詢本工地的人員數量。today_attendance = 今日實際出工人數(依工具箱會議簽名統計,分主承攬商與各供應商);registered = 在冊工人總數(人才列表,排除訪客)',
        parameters: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['today_attendance', 'registered'],
              description: '統計範圍:today_attendance 今日出工、registered 在冊工人',
            },
          },
          required: ['scope'],
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

  return { 日期: day, 有效許可單數: permits.length, 許可單摘要 };
}

async function getSiteInfo(siteId) {
  const site = await db.collection('site').findOne(
    { _id: new ObjectId(siteId) },
    // image/formLogo 是 base64 大欄位,絕不能進 LLM context
    { projection: { image: 0, formLogo: 0 } }
  );
  if (!site) return { error: '找不到工地資料' };
  return {
    專案編號: site.projectNo,
    專案名稱: site.projectName,
    工期開始: site.startDate,
    工期結束: site.endDate,
    縣市: site.county,
    鄉鎮市區: site.town,
    廠區: site.factories,
    作業類型: site.constructionTypes,
    今天日期: dayjs().format('YYYY-MM-DD'),
  };
}

/**
 * 執行一個 tool call,回傳 JSON 字串(給 LLM 的 tool message content)。
 * 任何錯誤(未知工具、壞 JSON args、DB 失敗)都回 error 字串讓 LLM 自行修正,
 * 絕不 throw —— tool 失敗不能讓整個 chat 500。
 */
async function executeToolCall(siteId, toolCall) {
  const name = toolCall?.function?.name;
  let args = {};
  try {
    if (toolCall?.function?.arguments) args = JSON.parse(toolCall.function.arguments);
  } catch {
    return JSON.stringify({ error: '工具參數不是合法 JSON,請修正後重試' });
  }

  try {
    let result;
    switch (name) {
      case 'get_project_progress':
        result = await getProjectProgress(siteId);
        break;
      case 'get_worker_count':
        result = await getWorkerCount(siteId, args.scope === 'registered' ? 'registered' : 'today_attendance');
        break;
      case 'get_active_permits':
        result = await getActivePermits(siteId, args.date);
        break;
      case 'get_site_info':
        result = await getSiteInfo(siteId);
        break;
      default:
        return JSON.stringify({ error: `未知的工具:${name}` });
    }
    return JSON.stringify(result);
  } catch (error) {
    logger.error(`AI tool ${name} 執行失敗:`, error.message);
    return JSON.stringify({ error: `查詢失敗:${error.message}` });
  }
}

module.exports = { getToolDefinitions, executeToolCall };
