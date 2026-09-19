# 指尖小助手

面向《指尖像素城》玩家的公开静态网页，提供区服日历、全服活动、圣域赛果与指尖百科。

新增 [兽印洗炼模拟器](https://detlettuce2.github.io/fingertip-assistant/?view=seal)：支持三种可洗炼兽印、词条预览、单次与连续洗炼、稀有／心愿停手、锁定、次数和材料统计、出货记录、刷新恢复及 CSV 导出。

词条和消耗取自用户提供的 Config；概率采用明确标注的模拟推演方案，不代表游戏真实概率。记录仅保存在当前浏览器，不与游戏账户同步。规则来源和验证说明见 [兽印模拟器说明](docs/beast-seal-simulator.md)。

访问地址：<https://detlettuce2.github.io/fingertip-assistant/>

本仓库只包含浏览器直接使用的网页文件、展示数据和图片素材，不包含数据采集、协议解析或游戏资源处理工具。

## 本地查看与测试

在仓库目录执行 `python -m http.server 4173`，访问 `http://localhost:4173/?view=seal`。页面需要 HTTP 服务读取 JSON，不能直接双击 HTML。

逻辑测试：Node.js 20 或以上执行 `npm test`，无需先安装依赖。

浏览器回归：执行 `npm ci`、`npx playwright install chromium`，然后运行 `npm run test:browser`。测试会自行启动临时本地服务和独立浏览器，输出截图与导出样本到已忽略的 `output/playwright/`。也可以通过 `BROWSER_EXECUTABLE` 指定本机 Chrome 路径。Playwright 仅用于开发测试，线上页面仍为无运行时依赖的静态网页。
