const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });

// Middleware
app.use(cors());
app.use(express.json());

// Hugging Face API configuration - USE A BETTER MODEL
const HF_API_KEY = process.env.HF_API_KEY;
const HF_API_URL = 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-large';
// Alternative models if above doesn't work:
// 'https://api-inference.huggingface.co/models/google/flan-t5-xl'
// 'https://api-inference.huggingface.co/models/gpt2'

// Enhanced Urban Farm Lab context
const URBAN_FARM_CONTEXT = `
You are Chatty, an AI assistant specialized in Metropolia University of Applied Sciences' Urban Farm Lab.

About Urban Farm Lab:
- Collaborative platform focusing on sustainable urban agriculture
- Brings together students, researchers, and industry partners
- Develops innovative solutions for food production in urban environments
- Explores vertical farming, hydroponics, and circular economy principles
- Part of Metropolia's Smart Lab ecosystem
- Focuses on smart farming technologies and sustainable food systems

Key personnel may include researchers like Andrea, but for specific staff information, check Metropolia's official website.

The lab conducts research projects in areas like:
- Urban agriculture technologies
- Sustainable food production
- Circular economy in agriculture
- Student-industry collaboration

Always be helpful, friendly, and focus on Urban Farm Lab related topics. If you don't know something, admit it politely.
`;

// Function to query Hugging Face API with better error handling
async function queryHuggingFace(question) {
    try {
        // Enhanced prompt engineering
        const prompt = `${URBAN_FARM_CONTEXT}

User Question: "${question}"

Please provide a helpful, accurate response about Urban Farm Lab:

Answer:`;

        const response = await axios.post(
            HF_API_URL,
            {
                inputs: prompt,
                parameters: {
                    max_new_tokens: 150,
                    temperature: 0.7,
                    do_sample: true,
                    return_full_text: false
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${HF_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 45000 // 45 second timeout
            }
        );

        let answer = response.data[0]?.generated_text || "";
        
        // Clean up the response
        answer = answer.trim();
        
        // Remove any repetitive prompts from the response
        if (answer.includes('Answer:')) {
            answer = answer.split('Answer:')[1]?.trim() || answer;
        }
        
        return answer || "I'd be happy to help you learn more about Metropolia's Urban Farm Lab. Could you please rephrase your question?";

    } catch (error) {
        console.error('Hugging Face API error:', error.response?.data || error.message);
        
        if (error.response?.status === 503) {
            return "The AI is currently initializing. This usually takes 20-30 seconds. Please try again in a moment.";
        }
        
        if (error.response?.status === 429) {
            return "The service is busy right now. Please wait a moment and try again.";
        }
        
        if (error.code === 'ECONNABORTED') {
            return "The request took too long. Please try again with a more specific question about Urban Farm Lab.";
        }
        
        return "I'm having trouble connecting to the knowledge base right now. Please try again shortly.";
    }
}

// Improved fallback responses
function getFallbackResponse(question) {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('hello') || lowerQuestion.includes('hi') || lowerQuestion.includes('hey')) {
        return "Hello! I'm Chatty, your AI assistant for Metropolia's Urban Farm Lab. How can I help you today?";
    } else if (lowerQuestion.includes('urban farm') || lowerQuestion.includes('farm lab')) {
        return "The Urban Farm Lab at Metropolia is a collaborative platform focusing on sustainable urban agriculture. It brings together students, researchers, and industry partners to develop innovative solutions for food production in urban environments through methods like vertical farming and hydroponics.";
    } else if (lowerQuestion.includes('metropolia') || lowerQuestion.includes('university')) {
        return "Metropolia University of Applied Sciences is Finland's largest university of applied sciences, offering practical education and conducting research that serves working life needs. The Urban Farm Lab is one of its innovative collaboration platforms.";
    } else if (lowerQuestion.includes('andrea')) {
        return "Andrea is likely a researcher or staff member associated with the Urban Farm Lab. For specific and up-to-date information about Andrea's role and contact details, I recommend checking the official Metropolia website or contacting the Urban Farm Lab directly.";
    } else if (lowerQuestion.includes('sustainable') || lowerQuestion.includes('agriculture') || lowerQuestion.includes('farming')) {
        return "Sustainable agriculture is a key focus of the Urban Farm Lab. The lab explores environmentally friendly food production methods suitable for urban environments, including circular economy principles and smart farming technologies.";
    } else if (lowerQuestion.includes('research') || lowerQuestion.includes('project') || lowerQuestion.includes('study')) {
        return "The Urban Farm Lab conducts various research projects in smart farming technologies, sustainable food systems, and urban-rural interactions. These projects often involve interdisciplinary collaboration between students, researchers, and industry partners.";
    } else if (lowerQuestion.includes('what') && lowerQuestion.includes('do')) {
        return "I specialize in providing information about Metropolia's Urban Farm Lab. I can tell you about the lab's research, projects, sustainable agriculture methods, and how it collaborates with students and industry partners.";
    } else {
        const defaultResponses = [
            "That's an interesting question! The Urban Farm Lab focuses on developing sustainable food production solutions for urban environments. Could you tell me more about what specific aspect interests you?",
            "I'd love to help you with that! The Urban Farm Lab works on innovative urban agriculture solutions. Could you rephrase your question or ask about something more specific related to urban farming?",
            "Thanks for your question! While I specialize in Metropolia's Urban Farm Lab topics, I'd be happy to help if you have questions about urban agriculture, sustainable farming, or the lab's research projects.",
            "That's a great question! The Urban Farm Lab brings together education, research, and business collaboration to advance urban farming solutions. What specific area are you curious about?",
            "I appreciate your interest! The Urban Farm Lab explores methods like vertical farming and hydroponics to create sustainable food systems in cities. How can I assist you further?"
        ];
        return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    }
}

// API Routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'Chatty AI Backend is running!',
        version: '1.0.1',
        status: 'operational',
        endpoints: {
            chat: 'POST /api/chat',
            health: 'GET /health'
        }
    });
});

app.post('/api/chat', async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question || question.trim() === '') {
            return res.status(400).json({ error: 'Question is required' });
        }

        const cleanQuestion = question.trim();
        console.log('Question received:', cleanQuestion);

        // Check cache first
        const cachedResponse = cache.get(cleanQuestion);
        if (cachedResponse) {
            console.log('Serving from cache');
            return res.json({ answer: cachedResponse, source: 'cache' });
        }

        // Try Hugging Face API
        console.log('Querying Hugging Face API...');
        let answer = await queryHuggingFace(cleanQuestion);

        // If API response is empty or error-like, use fallback
        if (!answer || answer.length < 10 || answer.includes('trouble connecting') || answer.includes('initializing')) {
            console.log('Using fallback response');
            answer = getFallbackResponse(cleanQuestion);
        }

        // Final cleanup
        answer = answer.trim();
        if (answer === '') {
            answer = getFallbackResponse(cleanQuestion);
        }
        
        // Cache the response
        cache.set(cleanQuestion, answer);
        console.log('Response generated:', answer.substring(0, 100) + '...');

        res.json({ 
            answer: answer,
            source: 'ai'
        });

    } catch (error) {
        console.error('Chat endpoint error:', error);
        
        // Fallback response in case of complete failure
        const fallbackAnswer = getFallbackResponse(req.body.question || '');
        res.json({ 
            answer: fallbackAnswer,
            source: 'fallback',
            error: 'Service temporarily unavailable'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Chatty AI Backend',
        version: '1.0.1'
    });
});

// Test Hugging Face connection on startup
app.get('/test', async (req, res) => {
    try {
        const testResponse = await queryHuggingFace("What is Urban Farm Lab?");
        res.json({
            status: 'API test completed',
            response: testResponse,
            apiStatus: testResponse.includes('trouble') ? 'unavailable' : 'available'
        });
    } catch (error) {
        res.json({
            status: 'API test failed',
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Chatty AI Backend running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🧪 API test: http://localhost:${PORT}/test`);
});