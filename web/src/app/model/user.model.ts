export interface User {
  _id?: string;
  // 姓名
  name: string;
  account: string;
  // 員工編號
  employeeId?: string;
  // 頭像
  avatar?: string;
  // 密碼
  password: string;
  role: 'admin' | 'manager' | 'secretary' | 'user';
  // 性別
  gender: string;
  // 生日
  birthday: string;
  // 血型
  bloodType: string;
  // 電話
  cell: string;
  email: string;
  // 身分證
  idno?: string;
  department: string;
  enabled: boolean;
  isFromSSO: boolean;
  createdUser?: string;
  createduserId?: string;
  createdTime?: Date;
  updatedUser?: string;
  updatedUserId?: string;
  updatedTime?: Date;
  belongSites?: { siteId: string; role: string }[];
}
