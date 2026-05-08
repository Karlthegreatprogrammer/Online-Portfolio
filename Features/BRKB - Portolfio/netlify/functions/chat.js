exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { messages } = JSON.parse(event.body);

    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid messages array' }) };
    }

    const GROQ_API_KEY = process.env.BRKB_API_KEY;
    if (!GROQ_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing BRKB_API_KEY environment variable' }) };
    }

    // Prepare system prompt for BRKB Digital Solutions
    const systemMessage = {
      role: 'system',
      content: `You are the official AI Assistant for BRKB Digital Solutions, a premium student-led digital agency.
Your tone is professional, confident, helpful, and slightly energetic.
You assist visitors with learning about the agency's services (Business Websites, Portfolios, Branding), values, and team.
Keep your answers concise, formatting them with line breaks where necessary.
Do not make up pricing. If asked about pricing, encourage them to use the "Start a Project" or "Get a Quote" forms.
The team consists of B. Reyes (Lead Developer), K. Dela Cruz (UI/UX Designer), and K. Buenaventura (Project Manager).`
    };

    const payload = {
      model: 'llama-3.1-8b-instant',
      messages: [systemMessage, ...messages],
      temperature: 0.7,
      max_tokens: 512
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Groq API Error:', errorData);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Groq API error: ${response.status} ${response.statusText}` })
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Function Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: `Internal Server Error: ${error.message}` }) };
  }
};
