// 登錄設定接口
export interface LoginSetting {
    _id?: string;
    type: 'login';
    enableAutoLogout: boolean; // 是否啟用自動登出
    autoLogoutMinutes: number; // 幾分鐘後自動登出
    enableAccountLockout: boolean; // 是否啟用帳號鎖定
    wrongInputTimes: number; // 輸入幾次錯誤後鎖定帳號
    lockoutMinutes: number; // 鎖定帳號幾分鐘
    enablePasswordExpiration?: boolean; // 是否啟用密碼過期
    passwordExpirationDays?: number; // 密碼過期天數
}
