import { Injectable } from '@angular/core';
import { EJSON, ObjectID, ObjectId } from 'bson';

@Injectable({
  providedIn: 'root',
})
export class MongodbService {
  urlPrefix = '';

  constructor() {
    // if port is 4200, set api url to localhost:3000
    if (window.location.port === '4200') {
      this.urlPrefix = 'http://localhost:3000';
    }
  }

  async get(
    collectionName: string,
    filter: any,
    option?: { sort?: any; projection?: any; limit?: number }
  ) {
    let url = this.urlPrefix + '/api/mongodb/' + collectionName;
    url += '?filter=' + EJSON.stringify(filter);
    if (option?.sort) {
      url += '&sort=' + EJSON.stringify(option.sort);
    }
    if (option?.projection) {
      url += '&projection=' + EJSON.stringify(option.projection);
    }
    url += '&limit=' + (option?.limit || 500);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    let result = await response.json();
    result = EJSON.parse(JSON.stringify(result));
    return result;
  }

  async getById(collectionName: string, id: string) {
    let results = await this.get(collectionName, { _id: new ObjectID(id) });
    if (results.length === 0) {
      return null;
    }
    return results[0];
  }

  async post(collectionName: string, data: any) {
    try {
      const response = await fetch(
        this.urlPrefix + '/api/mongodb/' + collectionName,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: EJSON.stringify(data),
        }
      );
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('post error', error);
      return null;
    }
  }

  async put(collectionName: string, id: string, data: any) {
    try {
      const response = await fetch(
        this.urlPrefix + '/api/mongodb/' + collectionName + '/' + id,
        {
          method: 'PUT',
          body: EJSON.stringify(data),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('put error', error);
      return null;
    }
  }

  async patch(collectionName: string, id: string, data: any) {
    try {
      const response = await fetch(
        this.urlPrefix + '/api/mongodb/' + collectionName + '/' + id,
        {
          method: 'PATCH',
          body: EJSON.stringify(data),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('patch error', error);
      return null;
    }
  }
  
  async delete(collectionName: string, id: string) {
    try {
      const response = await fetch(
        this.urlPrefix + '/api/mongodb/' + collectionName + '/' + id,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('delete error', error);
      return null;
    }
  }

  async count(collectionName: string, filter: any): Promise<number> {
    let url = `${this.urlPrefix}/api/mongodb/${collectionName}`;
    url += `?filter=${EJSON.stringify(filter)}`;
    url += '&limit=1'; // We only need the count, so we can limit to 1 document

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const paginationHeader = response.headers.get('X-Pagination');
      if (paginationHeader) {
        const pagination = JSON.parse(paginationHeader);
        return pagination.count || 0;
      }
      return 0;
    } catch (error) {
      console.error('count error', error);
      return 0;
    }
  }

  async aggregate(collection: string, ...expressions: any[]) {
    try {
      const response = await fetch(
        this.urlPrefix + '/api/mongodb/' + collection + '/aggregate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: EJSON.stringify(expressions),
        }
      );
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('aggregate error', error);
      return null;
    }
  }


  // 添加upsert方法來根據條件更新文檔，如果不存在則插入
  // async upsert(collectionName: string, filter: any, data: any) {
  //   try {
  //     // 首先查找是否存在符合條件的文檔
  //     const existingDocs = await this.get(collectionName, filter);
      
  //     if (existingDocs && existingDocs.length > 0) {
  //       // 如果存在，則更新文檔
  //       const existingDoc = existingDocs[0];
  //       const id = existingDoc._id.toString();
  //       // 使用PUT來更新整個文檔
  //       return await this.put(collectionName, id, data);
  //     } else {
  //       // 如果不存在，則創建新文檔
  //       return await this.post(collectionName, data);
  //     }
  //   } catch (error) {
  //     console.error('upsert error', error);
  //     return null;
  //   }
  // }

  async deleteMany(collectionName: string, query: any) {
    try {
      const response = await fetch(
        this.urlPrefix + '/api/mongodb/' + collectionName + '/deleteMany',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: EJSON.stringify(query),
        }
      );
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('deleteMany error', error);
      return null;
    }
  }

  async getSetting(key: string) {
    try {
      const response = await fetch(
        this.urlPrefix + '/api/serverconfig/' + key,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      // 檢查內容類型並相應處理
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        return result;
      } else {
        // 處理文字或其他格式的響應
        const textResult = await response.text();
        try {
          // 嘗試解析為 JSON，如果可能的話
          return JSON.parse(textResult);
        } catch (e) {
          // 如果不是有效的 JSON，則返回原始文字
          return textResult;
        }
      }
    } catch (error) {
      console.error('getSetting error', error);
      return null;
    }
  }
}
