const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
const server = http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(error,data)=>{ if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data); });
});
(async()=>{
  process.chdir(root);
  fs.mkdirSync('output/playwright',{recursive:true});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  try {
    for (const name of ['flows','edge-flows']) {
      const context = await browser.newContext({viewport:{width:1440,height:1050}});
      const page = await context.newPage();
      try {
        await page.goto(baseURL + '/?view=seal');
        const flow = require('./' + name + '.cjs');
        console.log(JSON.stringify({suite:name,...await flow(page,baseURL)},null,2));
      } catch(error) {
        await page.screenshot({path:`output/playwright/${name}-failure.png`,fullPage:true});
        throw error;
      } finally { await context.close(); }
    }
    const csv = fs.readFileSync('output/playwright/records.csv','utf8');
    if(csv.charCodeAt(0)!==65279 || csv.split('\r\n').length!==104) throw new Error('CSV row count or BOM is incorrect');
    if(fs.readFileSync('output/playwright/corrupt-backup.json','utf8')!=='{broken') throw new Error('Corrupt backup changed');
    console.log('CSV 103 data rows and original corrupt backup verified.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>server.close());
