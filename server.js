require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

let userHistories = {}; // { sessionId: [ { role: 'user', content: '...' }, { role: 'assistant', content: '...' } ] }

const companyKnowledge = fs.existsSync('company_knowledge.txt') ? fs.readFileSync('company_knowledge.txt', 'utf8') : '';

app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  console.log(`Session [${sessionId}] says: ${message}`);

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }

  if (!userHistories[sessionId]) {
    userHistories[sessionId] = [];
  }

  userHistories[sessionId].push({ role: 'user', content: message });

  const systemPrompt = `
You are a professional AI assistant working for Nokomis Tattoo.

Rules you MUST follow:

- ONLY discuss tattoo booking, pricing, artist info, or shop policies.
- Responses must be 1-3 short, clear, professional sentences.
- Vary your wording slightly each time, even if questions are similar.
- NEVER provide personal, political, or medical advice.
- Always maintain a polite, helpful, and businesslike tone.

Internal knowledge reference:
${companyKnowledge}
`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4', // (or 'gpt-3.5-turbo' if you want cheaper costs)
      messages: [
        { role: 'system', content: systemPrompt },
        ...userHistories[sessionId].map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ],
      temperature: 0.7, // 🔥 More varied replies
      max_tokens: 300 // Keep answers short
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const botReply = response.data.choices[0].message.content.trim();

    userHistories[sessionId].push({ role: 'assistant', content: botReply });

    res.json({ response: botReply });

  } catch (error) {
    console.error('Error contacting OpenAI:', error.response?.data || error.message);
    res.status(500).json({ error: 'OpenAI server error.' });
  }
});

app.get('/new-session', (req, res) => {
  const newSessionId = uuidv4();
  res.json({ sessionId: newSessionId });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
