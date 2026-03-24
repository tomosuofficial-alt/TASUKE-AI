/**
 * content-calendar.js の generateCopyPasteText と同じルール
 * Notion rich_text は 2000 文字制限のため 1900 で切る
 */
const MAX_RT = 1900;

function richTextPlain(prop) {
  if (!prop?.rich_text?.length) return '';
  return prop.rich_text.map((b) => b.plain_text || '').join('');
}

function generateCopyPasteText(caption, hashtags) {
  const c = (caption || '').trim();
  const h = (hashtags || '').trim();
  if (!c) return h;
  if (!h) return c;
  return `${c}\n\n${h}`;
}

function rt(text) {
  if (!text) return [];
  const t = text.length > MAX_RT ? text.substring(0, MAX_RT) + '…' : text;
  return [{ text: { content: t } }];
}

module.exports = {
  richTextPlain,
  generateCopyPasteText,
  rt,
  MAX_RT,
};
