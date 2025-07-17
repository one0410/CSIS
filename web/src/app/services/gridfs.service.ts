import { Injectable } from '@angular/core';
import { EJSON } from 'bson';

@Injectable({
  providedIn: 'root'
})
export class GridFSService {
  private apiBaseUrl = '';

  constructor() {
    // 根據環境設定基礎 URL
    this.apiBaseUrl = window.location.port === '4200' 
      ? 'http://localhost:3000' 
      : '';
  }

  /**
   * 上傳檔案到 GridFS
   * @param file 檔案物件
   * @param metadata 檔案相關的元數據
   * @returns Promise 包含上傳結果
   */
  async uploadFile(file: File, metadata: Record<string, any> = {}): Promise<any> {
    try {
      // 對大檔案進行大小檢查
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`檔案過大，大小限制為 ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }
      
      if (!file || file.size === 0) {
        throw new Error('檔案為空');
      }
      
      // 準備表單資料
      const formData = new FormData();
      
      // 重要：確保欄位名為 'file'，與伺服器端 multer 中的設定一致
      formData.append('file', file, file.name);
      
      // 添加元數據
      Object.entries(metadata).forEach(([key, value]) => {
        formData.append(key, String(value));
      });

      const url = `${this.apiBaseUrl}/api/gridfs/upload`;
      
      console.log('開始上傳檔案', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      
      // 使用原生 fetch API 上傳檔案
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        let errorMessage = '上傳檔案失敗';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (err) {
          // 無法解析 JSON
        }
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('檔案上傳失敗:', error);
      throw error;
    }
  }

  /**
   * 透過檔名刪除檔案
   * @param filename 檔案名稱
   * @returns Promise 包含刪除結果
   */
  async deleteFile(filename: string): Promise<any> {
    try {
      const url = `${this.apiBaseUrl}/api/gridfs/${filename}`;
      
      const response = await fetch(url, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('刪除檔案失敗');
      }
      
      return await response.json();
    } catch (error) {
      console.error('刪除檔案失敗:', error);
      throw error;
    }
  }

  /**
   * 更新檔案資訊
   * @param fileId 檔案 ID
   * @param metadata 要更新的元數據
   * @returns Promise 包含更新結果
   */
  async updateFileMetadata(fileId: string, metadata: Record<string, any>): Promise<any> {
    try {
      const url = `${this.apiBaseUrl}/api/gridfs/${fileId}`;
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: EJSON.stringify(metadata)
      });
      
      if (!response.ok) {
        throw new Error('更新檔案資訊失敗');
      }
      
      return await response.json();
    } catch (error) {
      console.error('更新檔案資訊失敗:', error);
      throw error;
    }
  }

  /**
   * 完全替換檔案
   * @param fileId 檔案 ID
   * @param newFile 新檔案
   * @param metadata 檔案元數據
   * @returns Promise 包含替換結果
   */
  async replaceFile(fileId: string, newFile: File, metadata: Record<string, any> = {}): Promise<any> {
    try {
      // 準備表單資料
      const formData = new FormData();
      formData.append('file', newFile, newFile.name);
      
      // 添加元數據
      Object.entries(metadata).forEach(([key, value]) => {
        formData.append(key, String(value));
      });

      const url = `${this.apiBaseUrl}/api/gridfs/${fileId}`;
      
      const response = await fetch(url, {
        method: 'PUT',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('替換檔案失敗');
      }
      
      return await response.json();
    } catch (error) {
      console.error('替換檔案失敗:', error);
      throw error;
    }
  }

  /**
   * 取得檔案資訊
   * @param filename 檔案名稱
   * @returns Promise 包含檔案資訊
   */
  async getFileInfo(filename: string): Promise<any> {
    try {
      const url = `${this.apiBaseUrl}/api/gridfs/${filename}/info`;
      
      console.log('正在獲取檔案資訊:', { filename, url });
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API 回應錯誤:', { 
          status: response.status, 
          statusText: response.statusText,
          responseText: errorText 
        });
        throw new Error(`取得檔案資訊失敗: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('API 回應非 JSON 格式:', { contentType, responseText });
        throw new Error('伺服器回應格式錯誤，預期為 JSON 但收到 HTML 或其他格式');
      }
      
      const result = await response.json();
      console.log('成功獲取檔案資訊:', result);
      return result;
    } catch (error) {
      console.error('取得檔案資訊失敗:', error);
      throw error;
    }
  }

  /**
   * 取得檔案列表
   * @param filter 查詢 metadata 過濾條件, 例如 { workerId: '123' }
   * @returns Promise 包含檔案列表
   */
  async getFiles(filter: Record<string, any> = {}): Promise<{success: boolean, files: any[]}> {
    try {
      const url = `${this.apiBaseUrl}/api/gridfs/search`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: EJSON.stringify(filter)
      });

      if (!response.ok) {
        throw new Error('取得檔案列表失敗');
      }
      
      return await response.json();
    } catch (error) {
      console.error('取得檔案失敗:', error);
      throw error;
    }
  }
}
