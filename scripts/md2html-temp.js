const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const baseDir = '/Users/takashiouchi/Library/CloudStorage/GoogleDrive-tomosu.official@gmail.com/その他のパソコン/Home_Mac_SSD/01_Projects/Yoidokoro_Senpuku/01_Consulting/01_Meeting/202605/アジェンダ';
const files = [
  '202605_アジェンダ（進行台本）.md',
  '202605_スタッフ配布サマリー.md',
  '202605_データシート.md',
  '202605_当日アジェンダ（スタッフ配布）.md'
];

// CSS無し版（Google Docs変換時にCSSは消えるため、ファイル軽量化を優先）
for (const fileName of files) {
  const mdPath = path.join(baseDir, fileName);
  const md = fs.readFileSync(mdPath, 'utf-8');
  const htmlBody = marked.parse(md);
  const fullHtml = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${fileName.replace('.md', '')}</title></head><body>${htmlBody}</body></html>`;
  const htmlPath = mdPath.replace(/\.md$/, '.html');
  fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
  console.log('OK:', fileName, '→', path.basename(htmlPath), `(${fullHtml.length} bytes)`);
}
