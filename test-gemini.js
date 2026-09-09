const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env', 'utf-8');
const keyMatch = env.match(/GEMINI_API_KEY=(.*)/);
const key = keyMatch ? keyMatch[1].trim() : '';

const order = 'Create a new file on desktop';
const workers = [
  { name: 'Employee-1', role: 'Fullstack Engineer' },
  { name: 'Employee-2', role: 'QA Engineer' },
];

const prompt =
  `You are the Executive Boss directing an AI office engineering team.\n` +
  `The Director (user) asks: "${order}"\n\n` +
  `Active Team Workers: ${workers.map((w) => w.name).join(', ')}\n\n` +
  `Determine if this is:\n` +
  `A) A conversational question, idea query, or greeting (e.g. "What can we do?", "Hello", "Ideas?"): Set isDirective=false, and in reply give an intelligent executive answer detailing what our office team can build (e.g., Python scripts, full-stack web apps, pixel games, data scrapers, APIs).\n` +
  `B) A concrete building goal: Set isDirective=true, reply with execution summary, and break down 1-3 tasks.\n\n` +
  `Return ONLY valid JSON:\n` +
  `{\n` +
  `  "isDirective": false,\n` +
  `  "reply": "Clear explanation of our capabilities and 3 project ideas",\n` +
  `  "tasks": []\n` +
  `}`;

const payload = JSON.stringify({
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: { temperature: 0.3 },
});

const req = https.request(
  {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  },
  (res) => {
    let body = '';
    res.on('data', (d) => (body += d));
    res.on('end', () => {
      const parsed = JSON.parse(body);
      const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log('OUTPUT:', text);
    });
  },
);
req.write(payload);
req.end();
