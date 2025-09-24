const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Middleware
app.use(cors());
app.use(express.json());

// Hugging Face API configuration
const HF_API_KEY = process.env.HF_API_KEY || 'your-huggingface-key-here';
const HF_API_URL = 'https://api-inference.huggingface.io/models/unsloth/Llama-3.2-1B-Instruct';

// Urban Farm Lab context (you can expand this with more specific information)
const URBAN_FARM_CONTEXT = `
Metropolia University of Applied Sciences Urban Farm Lab is a collaborative platform focusing on sustainable urban agriculture. 
It brings together students, researchers, and industry partners to develop innovative solutions for food production in urban environments.
The lab explores methods like vertical farming, hydroponics, and circular economy principles.

Key focus areas:
- Sustainable urban agriculture
- Smart farming technologies
- Food production in urban environments
- Circular economy in agriculture
- Student and industry collaboration

The Urban Farm Lab is part of Metropolia's Smart Lab ecosystem and serves as a platform for research, development, and innovation.
`;

// Function to query Hugging Face API
async function queryHuggingFace(prompt) {
    try {
        const response = await axios.post(
            HF_API_URL,
            {
                inputs: prompt,
                parameters: {
                    max_new_tokens: 512,
                    temperature: 0.7,
                    do_sample: false,
                    return_full_text: false
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${HF_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return response.data[0]?.generated_text || "I apologize, but I couldn't generate a response at the moment.";
    } catch (error) {
        console.error('Hugging Face API error:', error.response?.data || error.message);
        
        if (error.response?.status === 503) {
            return "The AI model is currently loading. Please try again in a few moments.";
        }
        
        if (error.code === 'ECONNABORTED') {
            return "The request timed out. Please try again with a simpler question.";
        }
        
        return "I'm experiencing technical difficulties. Please try again later.";
    }
}

// Enhanced prompt engineering
function createEnhancedPrompt(question) {
    return `
You are Chatty, an AI assistant specialized in Metropolia University of Applied Sciences' Urban Farm Lab.
Your role is to provide helpful, accurate information about the Urban Farm Lab and related topics.

Context about Urban Farm Lab:
${URBAN_FARM_CONTEXT}

User Question: "${question}"

Instructions:
- Provide a concise, informative answer focused on the Urban Farm Lab
- If the question is not directly related to Urban Farm Lab, gently steer the conversation back to relevant topics
- Be friendly and professional
- If you don't know something, admit it rather than making up information
- Keep responses under 3-4 sentences when possible

Answer:
`;
}

// Fallback responses for when API is unavailable
function getFallbackResponse(question) {
    const lowerQuestion = question.toLowerCase();
    
    const responses = {
        'urban farm': "The Urban Farm Lab at Metropolia is a collaborative platform focusing on sustainable urban agriculture. It brings together students, researchers, and industry partners to develop innovative solutions for food production in urban environments.",
        'metropolia': "Metropolia University of Applied Sciences is Finland's largest university of applied sciences, offering practical education and conducting research that serves working life needs.",
        'andrea': "Andrea is likely a researcher or staff member associated with the Urban Farm Lab. For specific information, I recommend checking Metropolia's official website or contacting the lab directly.",
        'sustainable': "Sustainable agriculture is a key focus of the Urban Farm Lab, exploring methods like vertical farming and circular economy principles for environmentally friendly food production.",
        'research': "The Urban Farm Lab conducts various research projects in smart farming technologies, sustainable food systems, and urban-rural interactions through interdisciplinary collaboration.",
        'default': "That's an interesting question about urban farming! The Urban Farm Lab focuses on developing innovative agricultural solutions suitable for urban environments through research and collaboration."
    };

    if (lowerQuestion.includes('urban farm') || lowerQuestion.includes('farm lab')) {
        return responses['urban farm'];
    } else if (lowerQuestion.includes('metropolia')) {
        return responses['metropolia'];
    } else if (lowerQuestion.includes('andrea')) {
        return responses['andrea'];
    } else if (lowerQuestion.includes('sustainable') || lowerQuestion.includes('agriculture')) {
        return responses['sustainable'];
    } else if (lowerQuestion.includes('research') || lowerQuestion.includes('project')) {
        return responses['research'];
    } else {
        return responses['default'];
    }
}

// API Routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'Chatty AI Backend is running!',
        version: '1.0.0',
        endpoints: {
            chat: 'POST /api/chat'
        }
    });
});

app.post('/api/chat', async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('Received question:', question);

        // Check cache first
        const cachedResponse = cache.get(question);
        if (cachedResponse) {
            console.log('Serving from cache');
            return res.json({ answer: cachedResponse });
        }

        // Try Hugging Face API first
        const prompt = createEnhancedPrompt(question);
        let answer = await queryHuggingFace(prompt);

        // If API fails or returns generic response, use fallback
        if (answer.includes("couldn't generate") || answer.includes("technical difficulties")) {
            console.log('Using fallback response');
            answer = getFallbackResponse(question);
        }

        // Clean up the response
        answer = answer.trim();
        
        // Cache the response
        cache.set(question, answer);

        res.json({ answer });

    } catch (error) {
        console.error('Chat endpoint error:', error);
        
        // Fallback response in case of complete failure
        const fallbackAnswer = getFallbackResponse(req.body.question || '');
        res.json({ answer: fallbackAnswer });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Chatty AI Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});