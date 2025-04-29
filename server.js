const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // For generating session IDs
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 🧠 Store separate histories per user session
let userHistories = {}; // { sessionId: [ { role: 'user', content: '...' }, { role: 'assistant', content: '...' } ] }

// 🧠 Function to dynamically load company knowledge based on clientId
function loadCompanyKnowledge(clientId) {
  const knowledgePath = path.join(__dirname, 'knowledge_bases', `${clientId}.txt`);
  if (fs.existsSync(knowledgePath)) {
    return fs.readFileSync(knowledgePath, 'utf8');
  } else {
    console.warn(`⚠️ No knowledge base found for clientId: ${clientId}`);
    return ''; // Empty fallback
  }
}

app.post('/chat', async (req, res) => {
  const { message, sessionId, clientId } = req.body;

  console.log(`Session [${sessionId}] (${clientId}) says: ${message}`);

  if (!sessionId || !clientId) {
    return res.status(400).json({ error: 'Session ID and Client ID are required.' });
  }

  // 🧠 Initialize session history if it doesn't exist
  if (!userHistories[sessionId]) {
    userHistories[sessionId] = [];
  }

  // 🧠 Add new user message to that session's history
  userHistories[sessionId].push({ role: 'user', content: message });

  // 🧠 Load the correct company's knowledge base
  const companyKnowledge = loadCompanyKnowledge(clientId);

  const systemPrompt = `
You are a professional AI assistant for a business identified as ${clientId}.

Rules you MUST follow at all times:

- ONLY answer questions based on the business's provided knowledge base.
- If unsure or outside the provided data, politely respond: "I'm not sure about that. Please contact us directly for more information."
- Keep responses friendly, professional, and no more than 3 sentences max.
- Stay on-topic. Do not engage in unrelated conversation.

Business-specific knowledge:
${companyKnowledge}

Conversation history:
`;

  // 🧠 Build full conversation from that user's history
  let conversationHistory = userHistories[sessionId].map(entry => {
    return `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`;
  }).join('\n');

  const finalPrompt = `${systemPrompt}\n\n${conversationHistory}\nAssistant:`;

  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      data: {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationHistory },
        ],
        temperature: 0.4,
        max_tokens: 500,
      }
    });

    if (response.data && response.data.choices && response.data.choices[0].message.content) {
      const aiReply = response.data.choices[0].message.content.trim();
      userHistories[sessionId].push({ role: 'assistant', content: aiReply });
      res.json({ response: aiReply });
    } else {
      res.json({ response: '[No AI response]' });
    }
  } catch (error) {
    console.error('Error talking to OpenAI:', error.message, error.response?.data);
    res.status(500).json({ error: 'OpenAI server error.' });
  }
});

// Optional: Endpoint to generate a new session ID if frontend needs it
app.get('/new-session', (req, res) => {
  const newSessionId = uuidv4();
  res.json({ sessionId: newSessionId });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
