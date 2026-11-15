// 例子：每小时提醒喝水。
// 用法：把这个文件复制到 %APPDATA%\dango-pet\plugins\ 里（没有这个文件夹就新建一个），重启团子。
module.exports = (团子) => {
  setInterval(() => 团子.nudge('一小时了，喝口水'), 3600e3);
};
