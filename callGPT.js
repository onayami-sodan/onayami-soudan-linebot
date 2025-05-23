// callGPT.js
require('dotenv').config();
const express = require('express');
const { Configuration, OpenAIApi } = require('openai');
const { middleware, Client } = require('@line/bot-sdk');
const supabase = require('./supabaseClient');

const app = express();
const port = process.env.PORT || 3000;

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const lineClient = new Client(lineConfig);

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

app.post('/webhook', middleware(lineConfig), async (req, res) => {
  const events = req.body.events;
  const results = await Promise.all(events.map(handleEvent));
  res.json(results);
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  await supabase
    .from('user_sessions')
    .upsert({ user_id: userId }, { onConflict: ['user_id'] });

  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: event.message.text }],
  });

  const answer = completion.data.choices[0].message.content.trim();
  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: answer,
  });
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
