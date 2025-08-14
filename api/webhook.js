// api/webhook.js
const crypto = require('crypto');

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const ACCESS_TOKEN   = process.env.LINE_ACCESS_TOKEN;

module.exports = async (req, res) => {
  // 讓瀏覽器 GET /api/webhook 也能看到 OK（debug 用）
  if (req.method === 'GET') return res.status(200).send('OK (Webhooks are up)');

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 收集 raw body 以便簽名驗證
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  // 驗證 X-Line-Signature
  const signature = crypto
    .createHmac('sha256', CHANNEL_SECRET || '')
    .update(rawBody)
    .digest('base64');

  const headerSig = req.headers['x-line-signature'];
  if (headerSig !== signature) {
    console.error('❌ Signature mismatch', {
      headerSig,
      computedSig: signature,
      hint: 'Check LINE_CHANNEL_SECRET in Vercel Env and Redeploy'
    });
    return res.status(401).send('Invalid signature');
  }

  // 解析事件
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    console.error('❌ JSON parse error', e);
    return res.status(400).send('Bad Request');
  }

  const events = body.events || [];
  console.log('📩 Incoming events:', events.map(e => e.type));

  // 處理訊息事件
  for (const event of events) {
    try {
      if (event.type === 'message' && event.message && event.message.type === 'text') {
        const userText = event.message.text || '';
        const replyText = `你說了：「${userText}」\n（部署成功 🎉）`;

        const resp = await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACCESS_TOKEN}`
          },
          body: JSON.stringify({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: replyText }]
          })
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error('❌ LINE reply failed', { status: resp.status, errText });
        } else {
          console.log('✅ Replied to user:', event.source && event.source.userId);
        }
      } else {
        console.log('ℹ️ Unhandled event:', event.type);
      }
    } catch (e) {
      console.error('❌ Handle event error:', e);
    }
  }

  // 全部處理完再回 200
  return res.status(200).send('OK');
};
