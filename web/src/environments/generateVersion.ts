// 每次 yarn build 或 yarn start 时，自动更新 buildVersion
// write buildVersion to environment.ts and environment.development.ts

import dayjs from "dayjs";
let fs = require('fs');

let buildVersion = dayjs().format("YYYY-MM-DD HHmm");
let content = `export const environment = {
    buildVersion: '${buildVersion}',
};`;

fs.writeFileSync('src/environments/environment.ts', content);

let contentDev = `export const environment = {
    buildVersion: 'dev. ${buildVersion}',
};`;
fs.writeFileSync('src/environments/environment.development.ts', contentDev);
