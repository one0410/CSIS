import { Injectable } from '@angular/core';
import { MongodbService } from './mongodb.service';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  constructor(
    private mongodbService: MongodbService,
  ) { }

  async add(action: string, description: string, before?: any, after?: any) {
    const user = JSON.parse(sessionStorage.getItem('user')!);

    let log: Log = {
      timestamp: new Date(),
      userId: user._id,
      account: user.account,
      action: action,
      description: description,
      before: before,
      after: after,
    };

    await this.mongodbService.post('log', log);
  }
}

export interface Log {
  _id?: string;
  timestamp: Date;
  userId: string;
  account: string;
  action: string;
  description: string;
  before?: any;
  after?: any;
}

