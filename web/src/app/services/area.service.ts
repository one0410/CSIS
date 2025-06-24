import { Injectable } from '@angular/core';

export interface Township {
  code: string;
  name: string;
}

export interface County {
  code: string;
  name: string;
  townships: Township[];
}

@Injectable({
  providedIn: 'root'
})
export class AreaService {
  private counties: County[] = [
    {
      code: 'TPE',
      name: '台北市',
      townships: [
        { code: '100', name: '中正區' },
        { code: '103', name: '大同區' },
        { code: '104', name: '中山區' },
        { code: '105', name: '松山區' },
        { code: '106', name: '大安區' },
        { code: '108', name: '萬華區' },
        { code: '110', name: '信義區' },
        { code: '111', name: '士林區' },
        { code: '112', name: '北投區' },
        { code: '114', name: '內湖區' },
        { code: '115', name: '南港區' },
        { code: '116', name: '文山區' }
      ]
    },
    {
      code: 'NTP',
      name: '新北市',
      townships: [
        { code: '207', name: '萬里區' },
        { code: '208', name: '金山區' },
        { code: '220', name: '板橋區' },
        { code: '221', name: '汐止區' },
        { code: '222', name: '深坑區' },
        { code: '223', name: '石碇區' },
        { code: '224', name: '瑞芳區' },
        { code: '226', name: '平溪區' },
        { code: '227', name: '雙溪區' },
        { code: '228', name: '貢寮區' },
        { code: '231', name: '新店區' },
        { code: '232', name: '坪林區' },
        { code: '233', name: '烏來區' },
        { code: '234', name: '永和區' },
        { code: '235', name: '中和區' },
        { code: '236', name: '土城區' },
        { code: '237', name: '三峽區' },
        { code: '238', name: '樹林區' },
        { code: '239', name: '鶯歌區' },
        { code: '241', name: '三重區' },
        { code: '242', name: '新莊區' },
        { code: '243', name: '泰山區' },
        { code: '244', name: '林口區' },
        { code: '247', name: '蘆洲區' },
        { code: '248', name: '五股區' },
        { code: '249', name: '八里區' },
        { code: '251', name: '淡水區' },
        { code: '252', name: '三芝區' },
        { code: '253', name: '石門區' }
      ]
    },
    {
      code: 'TYC',
      name: '桃園市',
      townships: [
        { code: '320', name: '中壢區' },
        { code: '324', name: '平鎮區' },
        { code: '325', name: '龍潭區' },
        { code: '326', name: '楊梅區' },
        { code: '327', name: '新屋區' },
        { code: '328', name: '觀音區' },
        { code: '330', name: '桃園區' },
        { code: '333', name: '龜山區' },
        { code: '334', name: '八德區' },
        { code: '335', name: '大溪區' },
        { code: '336', name: '復興區' },
        { code: '337', name: '大園區' },
        { code: '338', name: '蘆竹區' }
      ]
    },
    {
      code: 'HSC',
      name: '新竹縣',
      townships: [
        { code: '302', name: '竹北市' },
        { code: '303', name: '湖口鄉' },
        { code: '304', name: '新豐鄉' },
        { code: '305', name: '新埔鎮' },
        { code: '306', name: '關西鎮' },
        { code: '307', name: '芎林鄉' },
        { code: '308', name: '寶山鄉' },
        { code: '310', name: '竹東鎮' },
        { code: '311', name: '五峰鄉' },
        { code: '312', name: '橫山鄉' },
        { code: '313', name: '尖石鄉' },
        { code: '314', name: '北埔鄉' },
        { code: '315', name: '峨眉鄉' }
      ]
    },
    {
      code: 'HSC_CITY',
      name: '新竹市',
      townships: [
        { code: '300', name: '東區' },
        { code: '300', name: '北區' },
        { code: '300', name: '香山區' }
      ]
    },
    {
      code: 'MIA',
      name: '苗栗縣',
      townships: [
        { code: '350', name: '竹南鎮' },
        { code: '351', name: '頭份市' },
        { code: '352', name: '三灣鄉' },
        { code: '353', name: '南庄鄉' },
        { code: '354', name: '獅潭鄉' },
        { code: '356', name: '後龍鎮' },
        { code: '357', name: '通霄鎮' },
        { code: '358', name: '苑裡鎮' },
        { code: '360', name: '苗栗市' },
        { code: '361', name: '造橋鄉' },
        { code: '362', name: '頭屋鄉' },
        { code: '363', name: '公館鄉' },
        { code: '364', name: '大湖鄉' },
        { code: '365', name: '泰安鄉' },
        { code: '366', name: '銅鑼鄉' },
        { code: '367', name: '三義鄉' },
        { code: '368', name: '西湖鄉' },
        { code: '369', name: '卓蘭鎮' }
      ]
    },
    {
      code: 'TAC',
      name: '台中市',
      townships: [
        { code: '400', name: '中區' },
        { code: '401', name: '東區' },
        { code: '402', name: '南區' },
        { code: '403', name: '西區' },
        { code: '404', name: '北區' },
        { code: '406', name: '北屯區' },
        { code: '407', name: '西屯區' },
        { code: '408', name: '南屯區' },
        { code: '411', name: '太平區' },
        { code: '412', name: '大里區' },
        { code: '413', name: '霧峰區' },
        { code: '414', name: '烏日區' },
        { code: '420', name: '豐原區' },
        { code: '421', name: '后里區' },
        { code: '422', name: '石岡區' },
        { code: '423', name: '東勢區' },
        { code: '424', name: '和平區' },
        { code: '426', name: '新社區' },
        { code: '427', name: '潭子區' },
        { code: '428', name: '大雅區' },
        { code: '429', name: '神岡區' },
        { code: '432', name: '大肚區' },
        { code: '433', name: '沙鹿區' },
        { code: '434', name: '龍井區' },
        { code: '435', name: '梧棲區' },
        { code: '436', name: '清水區' },
        { code: '437', name: '大甲區' },
        { code: '438', name: '外埔區' },
        { code: '439', name: '大安區' }
      ]
    },
    {
      code: 'CHA',
      name: '彰化縣',
      townships: [
        { code: '500', name: '彰化市' },
        { code: '502', name: '芬園鄉' },
        { code: '503', name: '花壇鄉' },
        { code: '504', name: '秀水鄉' },
        { code: '505', name: '鹿港鎮' },
        { code: '506', name: '福興鄉' },
        { code: '507', name: '線西鄉' },
        { code: '508', name: '和美鎮' },
        { code: '509', name: '伸港鄉' },
        { code: '510', name: '員林市' },
        { code: '511', name: '社頭鄉' },
        { code: '512', name: '永靖鄉' },
        { code: '513', name: '埔心鄉' },
        { code: '514', name: '溪湖鎮' },
        { code: '515', name: '大村鄉' },
        { code: '516', name: '埔鹽鄉' },
        { code: '520', name: '田中鎮' },
        { code: '521', name: '北斗鎮' },
        { code: '522', name: '田尾鄉' },
        { code: '523', name: '埤頭鄉' },
        { code: '524', name: '溪州鄉' },
        { code: '525', name: '竹塘鄉' },
        { code: '526', name: '二林鎮' },
        { code: '527', name: '大城鄉' },
        { code: '528', name: '芳苑鄉' },
        { code: '530', name: '二水鄉' }
      ]
    },
    {
      code: 'NAN',
      name: '南投縣',
      townships: [
        { code: '540', name: '南投市' },
        { code: '541', name: '中寮鄉' },
        { code: '542', name: '草屯鎮' },
        { code: '544', name: '國姓鄉' },
        { code: '545', name: '埔里鎮' },
        { code: '546', name: '仁愛鄉' },
        { code: '551', name: '名間鄉' },
        { code: '552', name: '集集鎮' },
        { code: '553', name: '水里鄉' },
        { code: '555', name: '魚池鄉' },
        { code: '556', name: '信義鄉' },
        { code: '557', name: '竹山鎮' },
        { code: '558', name: '鹿谷鄉' }
      ]
    },
    {
      code: 'YUN',
      name: '雲林縣',
      townships: [
        { code: '630', name: '斗南鎮' },
        { code: '631', name: '大埤鄉' },
        { code: '632', name: '虎尾鎮' },
        { code: '633', name: '土庫鎮' },
        { code: '634', name: '褒忠鄉' },
        { code: '635', name: '東勢鄉' },
        { code: '636', name: '台西鄉' },
        { code: '637', name: '崙背鄉' },
        { code: '638', name: '麥寮鄉' },
        { code: '640', name: '斗六市' },
        { code: '643', name: '林內鄉' },
        { code: '646', name: '古坑鄉' },
        { code: '647', name: '莿桐鄉' },
        { code: '648', name: '西螺鎮' },
        { code: '649', name: '二崙鄉' },
        { code: '651', name: '北港鎮' },
        { code: '652', name: '水林鄉' },
        { code: '653', name: '口湖鄉' },
        { code: '654', name: '四湖鄉' },
        { code: '655', name: '元長鄉' }
      ]
    },
    {
      code: 'CHI',
      name: '嘉義縣',
      townships: [
        { code: '602', name: '番路鄉' },
        { code: '603', name: '梅山鄉' },
        { code: '604', name: '竹崎鄉' },
        { code: '605', name: '阿里山鄉' },
        { code: '606', name: '中埔鄉' },
        { code: '607', name: '大埔鄉' },
        { code: '608', name: '水上鄉' },
        { code: '611', name: '鹿草鄉' },
        { code: '612', name: '太保市' },
        { code: '613', name: '朴子市' },
        { code: '614', name: '東石鄉' },
        { code: '615', name: '六腳鄉' },
        { code: '616', name: '新港鄉' },
        { code: '621', name: '民雄鄉' },
        { code: '622', name: '大林鎮' },
        { code: '623', name: '溪口鄉' },
        { code: '624', name: '義竹鄉' },
        { code: '625', name: '布袋鎮' }
      ]
    },
    {
      code: 'CHI_CITY',
      name: '嘉義市',
      townships: [
        { code: '600', name: '東區' },
        { code: '600', name: '西區' }
      ]
    },
    {
      code: 'TNN',
      name: '台南市',
      townships: [
        { code: '700', name: '中西區' },
        { code: '701', name: '東區' },
        { code: '702', name: '南區' },
        { code: '704', name: '北區' },
        { code: '708', name: '安平區' },
        { code: '709', name: '安南區' },
        { code: '710', name: '永康區' },
        { code: '711', name: '歸仁區' },
        { code: '712', name: '新化區' },
        { code: '713', name: '左鎮區' },
        { code: '714', name: '玉井區' },
        { code: '715', name: '楠西區' },
        { code: '716', name: '南化區' },
        { code: '717', name: '仁德區' },
        { code: '718', name: '關廟區' },
        { code: '719', name: '龍崎區' },
        { code: '720', name: '官田區' },
        { code: '721', name: '麻豆區' },
        { code: '722', name: '佳里區' },
        { code: '723', name: '西港區' },
        { code: '724', name: '七股區' },
        { code: '725', name: '將軍區' },
        { code: '726', name: '學甲區' },
        { code: '727', name: '北門區' },
        { code: '730', name: '新營區' },
        { code: '731', name: '後壁區' },
        { code: '732', name: '白河區' },
        { code: '733', name: '東山區' },
        { code: '734', name: '六甲區' },
        { code: '735', name: '下營區' },
        { code: '736', name: '柳營區' },
        { code: '737', name: '鹽水區' },
        { code: '741', name: '善化區' },
        { code: '742', name: '大內區' },
        { code: '743', name: '山上區' },
        { code: '744', name: '新市區' },
        { code: '745', name: '安定區' }
      ]
    },
    {
      code: 'KHH',
      name: '高雄市',
      townships: [
        { code: '800', name: '新興區' },
        { code: '801', name: '前金區' },
        { code: '802', name: '苓雅區' },
        { code: '803', name: '鹽埕區' },
        { code: '804', name: '鼓山區' },
        { code: '805', name: '旗津區' },
        { code: '806', name: '前鎮區' },
        { code: '807', name: '三民區' },
        { code: '811', name: '楠梓區' },
        { code: '812', name: '小港區' },
        { code: '813', name: '左營區' },
        { code: '814', name: '仁武區' },
        { code: '815', name: '大社區' },
        { code: '820', name: '岡山區' },
        { code: '821', name: '路竹區' },
        { code: '822', name: '阿蓮區' },
        { code: '823', name: '田寮區' },
        { code: '824', name: '燕巢區' },
        { code: '825', name: '橋頭區' },
        { code: '826', name: '梓官區' },
        { code: '827', name: '彌陀區' },
        { code: '828', name: '永安區' },
        { code: '829', name: '湖內區' },
        { code: '830', name: '鳳山區' },
        { code: '831', name: '大寮區' },
        { code: '832', name: '林園區' },
        { code: '833', name: '鳥松區' },
        { code: '840', name: '大樹區' },
        { code: '842', name: '旗山區' },
        { code: '843', name: '美濃區' },
        { code: '844', name: '六龜區' },
        { code: '845', name: '內門區' },
        { code: '846', name: '杉林區' },
        { code: '847', name: '甲仙區' },
        { code: '848', name: '桃源區' },
        { code: '849', name: '那瑪夏區' },
        { code: '851', name: '茂林區' },
        { code: '852', name: '茄萣區' }
      ]
    },
    {
      code: 'PIF',
      name: '屏東縣',
      townships: [
        { code: '900', name: '屏東市' },
        { code: '901', name: '三地門鄉' },
        { code: '902', name: '霧台鄉' },
        { code: '903', name: '瑪家鄉' },
        { code: '904', name: '九如鄉' },
        { code: '905', name: '里港鄉' },
        { code: '906', name: '高樹鄉' },
        { code: '907', name: '鹽埔鄉' },
        { code: '908', name: '長治鄉' },
        { code: '909', name: '麟洛鄉' },
        { code: '911', name: '竹田鄉' },
        { code: '912', name: '內埔鄉' },
        { code: '913', name: '萬丹鄉' },
        { code: '920', name: '潮州鎮' },
        { code: '921', name: '泰武鄉' },
        { code: '922', name: '來義鄉' },
        { code: '923', name: '萬巒鄉' },
        { code: '924', name: '崁頂鄉' },
        { code: '925', name: '新埤鄉' },
        { code: '926', name: '南州鄉' },
        { code: '927', name: '林邊鄉' },
        { code: '928', name: '東港鎮' },
        { code: '929', name: '琉球鄉' },
        { code: '931', name: '佳冬鄉' },
        { code: '932', name: '新園鄉' },
        { code: '940', name: '枋寮鄉' },
        { code: '941', name: '枋山鄉' },
        { code: '942', name: '春日鄉' },
        { code: '943', name: '獅子鄉' },
        { code: '944', name: '車城鄉' },
        { code: '945', name: '牡丹鄉' },
        { code: '946', name: '恆春鎮' },
        { code: '947', name: '滿州鄉' }
      ]
    },
    {
      code: 'TTT',
      name: '台東縣',
      townships: [
        { code: '950', name: '台東市' },
        { code: '951', name: '綠島鄉' },
        { code: '952', name: '蘭嶼鄉' },
        { code: '953', name: '延平鄉' },
        { code: '954', name: '卑南鄉' },
        { code: '955', name: '鹿野鄉' },
        { code: '956', name: '關山鎮' },
        { code: '957', name: '海端鄉' },
        { code: '958', name: '池上鄉' },
        { code: '959', name: '東河鄉' },
        { code: '961', name: '成功鎮' },
        { code: '962', name: '長濱鄉' },
        { code: '963', name: '太麻里鄉' },
        { code: '964', name: '金峰鄉' },
        { code: '965', name: '大武鄉' },
        { code: '966', name: '達仁鄉' }
      ]
    },
    {
      code: 'HUA',
      name: '花蓮縣',
      townships: [
        { code: '970', name: '花蓮市' },
        { code: '971', name: '新城鄉' },
        { code: '972', name: '太魯閣' },
        { code: '973', name: '秀林鄉' },
        { code: '974', name: '吉安鄉' },
        { code: '975', name: '壽豐鄉' },
        { code: '976', name: '鳳林鎮' },
        { code: '977', name: '光復鄉' },
        { code: '978', name: '豐濱鄉' },
        { code: '979', name: '瑞穗鄉' },
        { code: '981', name: '玉里鎮' },
        { code: '982', name: '卓溪鄉' },
        { code: '983', name: '富里鄉' }
      ]
    },
    {
      code: 'PEN',
      name: '澎湖縣',
      townships: [
        { code: '880', name: '馬公市' },
        { code: '881', name: '西嶼鄉' },
        { code: '882', name: '望安鄉' },
        { code: '883', name: '七美鄉' },
        { code: '884', name: '白沙鄉' },
        { code: '885', name: '湖西鄉' }
      ]
    },
    {
      code: 'KIN',
      name: '金門縣',
      townships: [
        { code: '890', name: '金沙鎮' },
        { code: '891', name: '金湖鎮' },
        { code: '892', name: '金寧鄉' },
        { code: '893', name: '金城鎮' },
        { code: '894', name: '烈嶼鄉' },
        { code: '896', name: '烏坵鄉' }
      ]
    },
    {
      code: 'LIE',
      name: '連江縣',
      townships: [
        { code: '209', name: '南竿鄉' },
        { code: '210', name: '北竿鄉' },
        { code: '211', name: '莒光鄉' },
        { code: '212', name: '東引鄉' }
      ]
    }
  ];

  constructor() { }

  /**
   * 取得所有縣市清單
   */
  getCounties(): County[] {
    return this.counties;
  }

  /**
   * 根據縣市名稱取得鄉鎮市區清單
   */
  getTownshipsByCounty(countyName: string): Township[] {
    const county = this.counties.find(c => c.name === countyName);
    return county ? county.townships : [];
  }

  /**
   * 取得縣市名稱清單
   */
  getCountyNames(): string[] {
    return this.counties.map(county => county.name);
  }

  /**
   * 根據縣市名稱取得鄉鎮市區名稱清單
   */
  getTownshipNamesByCounty(countyName: string): string[] {
    const townships = this.getTownshipsByCounty(countyName);
    return townships.map(township => township.name);
  }
} 