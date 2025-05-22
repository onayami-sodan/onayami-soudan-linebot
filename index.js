const line = require('@line/bot-sdk');
const express = require('express');

// 環境変数から設定を読み取る
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// webhookでPOSTを受け取る
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// メッセージ処理のメイン関数
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  let replyText = '今日はどんなお悩み？\n\n';
  replyText += '① 恋愛\n② 婚活\n③ 人間関係\n④ 孤独・寂しさ\n⑤ 話し相手がほしい\n\n番号で選んでね♪';

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

// ポート3000で起動（Render用）
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
