import { Injectable, inject } from '@angular/core';
import { MongodbService } from './mongodb.service';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

// 廠商出工統計介面
export interface ContractorWorkerCount {
  contractorName: string;
  workerCount: number;
}

// 週報表廠商出工統計介面
export interface WeeklyContractorWorkerCount {
  contractorName: string;
  totalWorkerCount: number;
  dailyBreakdown: {
    date: string;
    workerCount: number;
  }[];
  averageWorkerCount: number;
}

// 月報表週統計介面
export interface WeeklyWorkerCount {
  weekNumber: number;
  startDate: string;
  endDate: string;
  totalWorkers: number;
  peakWorkers: number;
  averageWorkers: number;
  workDays: number;
}

// 月報表廠商統計介面
export interface ContractorMonthlyStats {
  contractorName: string;
  totalWorkers: number;
  weeklyStats: WeeklyWorkerCount[];
  averageWorkers: number;
  peakWeek: number;
  trend: Array<{week: number, workers: number}>;
}

// 原始出工記錄介面
export interface RawWorkerCountData {
  date: string;
  contractorCounts: Map<string, Set<string>>;
}

// 分離主承攬商與供應商的出工統計介面
export interface SeparatedWorkerCountData {
  date: string;
  mainContractorCount: number;           // 主承攬商人數
  mainContractorWorkers: Set<string>;    // 主承攬商工人名單
  supplierCounts: Map<string, Set<string>>; // 供應商統計（按公司分組）
  supplierTotalCount: number;            // 供應商總人數
}

@Injectable({
  providedIn: 'root'
})
export class WorkerCountService {
  private mongodbService = inject(MongodbService);

  /**
   * 從工具箱會議記錄中提取簽名數據並統計各廠商出工人數
   * @param meetings 工具箱會議記錄陣列
   * @returns 廠商出工統計 Map，key 為廠商名稱，value 為工人名稱 Set
   */
  private extractWorkerCountsFromMeetings(meetings: any[]): Map<string, Set<string>> {
    const contractorCountMap = new Map<string, Set<string>>();

    for (const meeting of meetings) {
      if (meeting.healthWarnings) {
        // 收集所有4個廠商的簽名陣列
        const allSignatureArrays = [
          meeting.healthWarnings.attendeeMainContractorSignatures || [],
          meeting.healthWarnings.attendeeSubcontractor1Signatures || [],
          meeting.healthWarnings.attendeeSubcontractor2Signatures || [],
          meeting.healthWarnings.attendeeSubcontractor3Signatures || []
        ];

        for (const signatures of allSignatureArrays) {
          for (const signature of signatures) {
            if (signature && signature.name && signature.signature && signature.company) {
              const companyName = signature.company.trim();

              if (!contractorCountMap.has(companyName)) {
                contractorCountMap.set(companyName, new Set());
              }

              // 使用工人姓名作為唯一識別（同一個工人在同一公司只計算一次）
              contractorCountMap.get(companyName)!.add(signature.name);
            }
          }
        }
      }
    }

    return contractorCountMap;
  }

  /**
   * 從工具箱會議記錄中提取簽名數據，分離主承攬商與供應商
   * 主承攬商：來自 attendeeMainContractorSignatures
   * 供應商：來自 attendeeSubcontractor1/2/3Signatures
   * @param meetings 工具箱會議記錄陣列
   * @returns 分離後的統計數據
   */
  private extractSeparatedWorkerCounts(meetings: any[]): {
    mainContractorWorkers: Set<string>;
    supplierCounts: Map<string, Set<string>>;
  } {
    const mainContractorWorkers = new Set<string>();
    const supplierCounts = new Map<string, Set<string>>();

    for (const meeting of meetings) {
      if (meeting.healthWarnings) {
        // 主承攬商簽名（第一個陣列）
        const mainContractorSignatures = meeting.healthWarnings.attendeeMainContractorSignatures || [];
        for (const signature of mainContractorSignatures) {
          if (signature && signature.name && signature.signature) {
            mainContractorWorkers.add(signature.name);
          }
        }

        // 供應商/分包商簽名（其他三個陣列）
        const subcontractorArrays = [
          meeting.healthWarnings.attendeeSubcontractor1Signatures || [],
          meeting.healthWarnings.attendeeSubcontractor2Signatures || [],
          meeting.healthWarnings.attendeeSubcontractor3Signatures || []
        ];

        for (const signatures of subcontractorArrays) {
          for (const signature of signatures) {
            if (signature && signature.name && signature.signature && signature.company) {
              const companyName = signature.company.trim();

              if (!supplierCounts.has(companyName)) {
                supplierCounts.set(companyName, new Set());
              }

              supplierCounts.get(companyName)!.add(signature.name);
            }
          }
        }
      }
    }

    return { mainContractorWorkers, supplierCounts };
  }

  /**
   * 統一的出工人數查詢方法
   * @param siteId 工地ID
   * @param startDate 開始日期 (YYYY-MM-DD)
   * @param endDate 結束日期 (YYYY-MM-DD)
   * @returns 原始出工記錄數據，包含每日的廠商出工統計
   */
  async getWorkerCountData(siteId: string, startDate: string, endDate: string): Promise<RawWorkerCountData[]> {
    try {
      // 建立查詢條件
      const query = {
        siteId: siteId,
        formType: 'toolboxMeeting',
        applyDate: {
          $gte: startDate,
          $lte: endDate
        }
      };

      console.log('查詢出工人數:', query);

      const toolboxMeetings = await this.mongodbService.getArray('siteForm', query);

      if (!toolboxMeetings || !Array.isArray(toolboxMeetings)) {
        return [];
      }

      // 按日期分組處理會議記錄
      const dailyDataMap = new Map<string, any[]>();
      
      for (const meeting of toolboxMeetings) {
        const meetingDate = meeting.applyDate;
        if (!dailyDataMap.has(meetingDate)) {
          dailyDataMap.set(meetingDate, []);
        }
        dailyDataMap.get(meetingDate)!.push(meeting);
      }

      // 轉換為結果格式
      const result: RawWorkerCountData[] = [];
      
      // 確保每一天都有記錄（即使沒有會議）
      const start = dayjs(startDate);
      const end = dayjs(endDate);
      let currentDate = start;
      
      while (currentDate.isSameOrBefore(end)) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        const dayMeetings = dailyDataMap.get(dateStr) || [];
        const contractorCounts = this.extractWorkerCountsFromMeetings(dayMeetings);
        
        result.push({
          date: dateStr,
          contractorCounts
        });
        
        currentDate = currentDate.add(1, 'day');
      }

      return result;
    } catch (error) {
      console.error('查詢出工人數失敗:', error);
      return [];
    }
  }

  /**
   * 查詢指定日期的廠商出工人數統計
   * @param siteId 工地ID
   * @param date 查詢日期 (YYYY-MM-DD)
   * @returns 廠商出工統計陣列
   */
  async getDailyContractorWorkerCount(siteId: string, date: string): Promise<ContractorWorkerCount[]> {
    const rawData = await this.getWorkerCountData(siteId, date, date);

    if (rawData.length === 0) {
      return [];
    }

    const dayData = rawData[0];

    // 轉換為陣列格式，過濾掉沒有簽名或公司名稱為空的項目
    const counts: ContractorWorkerCount[] = Array.from(dayData.contractorCounts.entries())
      .filter(([contractorName, workerSet]) =>
        workerSet.size > 0 &&
        contractorName &&
        contractorName.trim() !== ''
      )
      .map(([contractorName, workerSet]) => ({
        contractorName,
        workerCount: workerSet.size
      }))
      .sort((a, b) => b.workerCount - a.workerCount);

    return counts;
  }

  /**
   * 查詢指定日期的分離出工人數統計（區分主承攬商與供應商）
   * 主承攬商：來自工具箱會議的 attendeeMainContractorSignatures
   * 供應商：來自工具箱會議的 attendeeSubcontractor1/2/3Signatures
   * @param siteId 工地ID
   * @param date 查詢日期 (YYYY-MM-DD)
   * @returns 分離後的出工統計
   */
  async getDailySeparatedWorkerCount(siteId: string, date: string): Promise<SeparatedWorkerCountData> {
    try {
      // 建立查詢條件
      const query = {
        siteId: siteId,
        formType: 'toolboxMeeting',
        applyDate: date
      };

      const toolboxMeetings = await this.mongodbService.getArray('siteForm', query);

      if (!toolboxMeetings || !Array.isArray(toolboxMeetings) || toolboxMeetings.length === 0) {
        return {
          date,
          mainContractorCount: 0,
          mainContractorWorkers: new Set(),
          supplierCounts: new Map(),
          supplierTotalCount: 0
        };
      }

      // 提取分離的工人統計
      const { mainContractorWorkers, supplierCounts } = this.extractSeparatedWorkerCounts(toolboxMeetings);

      // 計算供應商總人數
      let supplierTotalCount = 0;
      supplierCounts.forEach((workers) => {
        supplierTotalCount += workers.size;
      });

      return {
        date,
        mainContractorCount: mainContractorWorkers.size,
        mainContractorWorkers,
        supplierCounts,
        supplierTotalCount
      };
    } catch (error) {
      console.error('查詢分離出工人數失敗:', error);
      return {
        date,
        mainContractorCount: 0,
        mainContractorWorkers: new Set(),
        supplierCounts: new Map(),
        supplierTotalCount: 0
      };
    }
  }

  /**
   * 查詢指定週的廠商出工人數統計
   * @param siteId 工地ID
   * @param weekStart 週開始日期 (YYYY-MM-DD)
   * @returns 週廠商出工統計陣列
   */
  async getWeeklyContractorWorkerCount(siteId: string, weekStart: string): Promise<WeeklyContractorWorkerCount[]> {
    // 計算週的日期範圍
    const startDate = dayjs(weekStart);
    const endDate = startDate.add(6, 'day');
    
    const rawData = await this.getWorkerCountData(
      siteId, 
      startDate.format('YYYY-MM-DD'), 
      endDate.format('YYYY-MM-DD')
    );

    if (rawData.length === 0) {
      return [];
    }

    // 統計每個廠商的週出工人數
    const contractorMap = new Map<string, WeeklyContractorWorkerCount>();

    // 為每一天初始化數據
    const weekDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      weekDays.push(startDate.add(i, 'day').format('YYYY-MM-DD'));
    }

    // 處理每日數據
    for (const dayData of rawData) {
      dayData.contractorCounts.forEach((workerSet, companyName) => {
        if (workerSet.size > 0 && companyName && companyName.trim() !== '') {
          let weeklyData = contractorMap.get(companyName);
          if (!weeklyData) {
            weeklyData = {
              contractorName: companyName,
              totalWorkerCount: 0,
              dailyBreakdown: weekDays.map(date => ({ date, workerCount: 0 })),
              averageWorkerCount: 0
            };
            contractorMap.set(companyName, weeklyData);
          }

          // 更新該日的人數
          const dayIndex = weekDays.indexOf(dayData.date);
          if (dayIndex >= 0) {
            weeklyData.dailyBreakdown[dayIndex].workerCount += workerSet.size;
            weeklyData.totalWorkerCount += workerSet.size;
          }
        }
      });
    }

    // 計算平均人數並轉換為陣列
    const result = Array.from(contractorMap.values()).map(item => ({
      ...item,
      averageWorkerCount: Math.round((item.totalWorkerCount / 7) * 10) / 10
    }));

    // 按總人數排序
    result.sort((a, b) => b.totalWorkerCount - a.totalWorkerCount);

    return result;
  }

  /**
   * 查詢指定月份的廠商出工人數統計
   * @param siteId 工地ID
   * @param monthStr 月份字串 (YYYY-MM)
   * @returns 月廠商出工統計陣列
   */
  async getMonthlyContractorWorkerCount(siteId: string, monthStr: string): Promise<ContractorMonthlyStats[]> {
    const startDate = dayjs(monthStr).startOf('month');
    const endDate = dayjs(monthStr).endOf('month');

    const rawData = await this.getWorkerCountData(
      siteId,
      startDate.format('YYYY-MM-DD'),
      endDate.format('YYYY-MM-DD')
    );

    if (rawData.length === 0) {
      return [];
    }

    // 獲取月份的所有週數
    const weeks = this.getWeeksInMonth(monthStr);
    
    // 處理數據並計算統計
    const stats = this.calculateMonthlyStats(rawData, weeks);
    return stats;
  }

  /**
   * 獲取月份中的所有週數
   * @param monthStr 月份字串 (YYYY-MM)
   * @returns 週數陣列
   */
  private getWeeksInMonth(monthStr: string): Array<{weekNumber: number, start: string, end: string}> {
    const startOfMonth = dayjs(monthStr).startOf('month');
    const endOfMonth = dayjs(monthStr).endOf('month');
    const weeks: Array<{weekNumber: number, start: string, end: string}> = [];
    
    let currentWeekStart = startOfMonth.startOf('week');
    let weekNumber = 1;
    
    while (currentWeekStart.isBefore(endOfMonth) || currentWeekStart.isSame(endOfMonth)) {
      const weekEnd = currentWeekStart.endOf('week');
      const effectiveEnd = weekEnd.isAfter(endOfMonth) ? endOfMonth : weekEnd;
      
      weeks.push({
        weekNumber,
        start: currentWeekStart.format('YYYY-MM-DD'),
        end: effectiveEnd.format('YYYY-MM-DD')
      });
      
      currentWeekStart = currentWeekStart.add(1, 'week');
      weekNumber++;
      
      if (currentWeekStart.isAfter(endOfMonth)) break;
    }
    
    return weeks;
  }

  /**
   * 計算月份統計數據
   * @param rawData 原始每日出工數據
   * @param weeks 週數陣列
   * @returns 廠商月統計陣列
   */
  private calculateMonthlyStats(rawData: RawWorkerCountData[], weeks: Array<{weekNumber: number, start: string, end: string}>): ContractorMonthlyStats[] {
    const contractorMap = new Map<string, ContractorMonthlyStats>();

    // 為每個週期初始化統計
    weeks.forEach(week => {
      rawData.forEach(dayData => {
        const dayDate = dayjs(dayData.date);
        
        // 檢查日期是否在這週內
        if (dayDate.isBetween(week.start, week.end, 'day', '[]')) {
          // 處理簽名數據結構
          dayData.contractorCounts.forEach((workerSet, contractorName) => {
            if (workerSet.size > 0 && contractorName && contractorName.trim() !== '') {
              let contractor = contractorMap.get(contractorName);
              if (!contractor) {
                contractor = {
                  contractorName,
                  totalWorkers: 0,
                  weeklyStats: weeks.map(w => ({
                    weekNumber: w.weekNumber,
                    startDate: w.start,
                    endDate: w.end,
                    totalWorkers: 0,
                    peakWorkers: 0,
                    averageWorkers: 0,
                    workDays: 0
                  })),
                  averageWorkers: 0,
                  peakWeek: 1,
                  trend: []
                };
                contractorMap.set(contractorName, contractor);
              }

              // 找到對應的週統計
              const weekStat = contractor.weeklyStats.find(w => w.weekNumber === week.weekNumber);
              if (weekStat) {
                // 累加工人數
                const workerCount = workerSet.size;
                weekStat.totalWorkers += workerCount;
                contractor.totalWorkers += workerCount;
                weekStat.workDays += 1;
                
                // 更新峰值
                if (workerCount > weekStat.peakWorkers) {
                  weekStat.peakWorkers = workerCount;
                }
              }
            }
          });
        }
      });
    });

    // 計算最終統計數據
    const result = Array.from(contractorMap.values());
    
    result.forEach(contractor => {
      // 計算每週平均工人數
      contractor.weeklyStats.forEach(weekStat => {
        weekStat.averageWorkers = weekStat.workDays > 0 
          ? Math.round((weekStat.totalWorkers / weekStat.workDays) * 10) / 10
          : 0;
      });
      
      // 計算整體平均
      const totalWorkDays = contractor.weeklyStats.reduce((sum, week) => sum + week.workDays, 0);
      contractor.averageWorkers = totalWorkDays > 0 
        ? Math.round((contractor.totalWorkers / totalWorkDays) * 10) / 10
        : 0;
      
      // 找出峰值週
      let maxWeekWorkers = 0;
      contractor.weeklyStats.forEach((week, index) => {
        if (week.peakWorkers > maxWeekWorkers) {
          maxWeekWorkers = week.peakWorkers;
          contractor.peakWeek = week.weekNumber;
        }
      });
      
      // 生成趨勢數據
      contractor.trend = contractor.weeklyStats.map(week => ({
        week: week.weekNumber,
        workers: week.averageWorkers
      }));
    });

    // 按總工人數排序
    result.sort((a, b) => b.totalWorkers - a.totalWorkers);
    
    return result;
  }
} 