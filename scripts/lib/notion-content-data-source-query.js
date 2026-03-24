/**
 * コンテンツ DB がマルチデータソース化されたため、
 * databases.query の代わりに data_sources/{id}/query を使う。
 * @see https://developers.notion.com/reference/query-a-data-source
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const DATA_SOURCE_ID =
  process.env.NOTION_CONTENT_DATA_SOURCE_ID || 'f61e6093-e419-4475-b8d3-64d294983959';

async function queryContentDataSource(body) {
  const res = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(`Notion data_sources/query ${res.status}`);
    err.body = json;
    throw err;
  }
  return json;
}

module.exports = { queryContentDataSource, DATA_SOURCE_ID };
