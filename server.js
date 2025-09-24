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

// Hugging Face API configuration - USING WORKING MODELS
const HF_API_KEY = process.env.HF_API_KEY;

// List of working models (try in order)
const MODEL_URLS = [
    'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', // Most reliable
    'https://api-inference.huggingface.co/models/google/flan-t5-base',
    'https://api-inference.huggingface.co/models/gpt2',
    'https://api-inference.huggingface.co/models/distilgpt2'
];

let currentModelIndex = 0;

// Function to get current model URL
function getCurrentModelUrl() {
    return MODEL_URLS[currentModelIndex];
}

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

Key areas: sustainable agriculture, urban farming, research projects, student collaboration
`;

// Function to query Hugging Face API with model fallback
async function queryHuggingFace(question) {
    const maxRetries = MODEL_URLS.length;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const currentUrl = getCurrentModelUrl();
            console.log(`Attempt ${attempt + 1}: Using model ${currentUrl}`);
            
            const prompt = `Context: ${URBAN_FARM_CONTEXT}

Question: ${question}

Answer as Chatty, the Urban Farm Lab assistant:`;

            const response = await axios.post(
                currentUrl,
                {
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 200,
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
                    timeout: 30000
                }
            );

            let answer = response.data[0]?.generated_text || "";
            
            // Clean up the response
            answer = answer.trim();
            
            // Remove any repetitive content
            if (answer.includes('Answer:')) {
                answer = answer.split('Answer:')[1]?.trim() || answer;
            }
            if (answer.includes('Question:')) {
                answer = answer.split('Question:')[0]?.trim() || answer;
            }
            
            return answer || "I'd be happy to tell you more about Metropolia's Urban Farm Lab. What specific aspect interests you?";

        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error.response?.status, error.response?.data?.error || error.message);
            
            // If it's a model-specific error, try next model
            if (error.response?.status === 404 || error.response?.status === 503) {
                currentModelIndex = (currentModelIndex + 1) % MODEL_URLS.length;
                console.log(`Switching to next model: ${getCurrentModelUrl()}`);
                continue;
            }
            
            // For other errors, break and use fallback
            break;
        }
    }
    
    return null; // All models failed
}

// Improved fallback responses
function getFallbackResponse(question) {
    const lowerQuestion = question.toLowerCase();
    
    const responses = {
        greeting: "Hello! I'm Chatty, your AI assistant for Metropolia's Urban Farm Lab. I can tell you about sustainable urban agriculture, research projects, and how the lab collaborates with students and industry partners.",
        urbanFarm: "The Urban Farm Lab at Metropolia is a collaborative platform that focuses on sustainable urban agriculture. It brings together students, researchers, and industry partners to develop innovative solutions for food production in urban environments using methods like vertical farming and hydroponics.",
        metropolia: "Metropolia University of Applied Sciences is Finland's largest university of applied sciences. The Urban Farm Lab is one of its innovative platforms that combines education, research, and business collaboration in sustainable food production.",
        andrea: "Andrea is likely a researcher or staff member associated with the Urban Farm Lab. For specific and current information about team members, I recommend checking the official Metropolia website or contacting the Urban Farm Lab directly.",
        sustainable: "Sustainable agriculture is a key focus of the Urban Farm Lab. The lab explores environmentally friendly food production methods suitable for urban environments, including circular economy principles and innovative farming technologies.",
        research: "The Urban Farm Lab conducts various research projects in areas like smart farming technologies, sustainable food systems, and urban agriculture. These projects often involve collaboration between students, researchers, and industry partners.",
        default: "That's an interesting question about urban farming! The Urban Farm Lab focuses on developing sustainable food production solutions for cities. Could you tell me more about what specific aspect you're curious about?"
    };

    if (lowerQuestion.includes('hello') || lowerQuestion.includes('hi') || lowerQuestion.includes('hey')) {
        return responses.greeting;
    } else if (lowerQuestion.includes('urban farm') || lowerQuestion.includes('farm lab')) {
        return responses.urbanFarm;
    } else if (lowerQuestion.includes('metropolia') || lowerQuestion.includes('university')) {
        return responses.metropolia;
    } else if (lowerQuestion.includes('andrea')) {
        return responses.andrea;
    } else if (lowerQuestion.includes('sustainable') || lowerQuestion.includes('agriculture') || lowerQuestion.includes('farming')) {
        return responses.sustainable;
    } else if (lowerQuestion.includes('research') || lowerQuestion.includes('project') || lowerQuestion.includes('study')) {
        return responses.research;
    } else {
        return responses.default;
    }
}

// API Routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'Chatty AI Backend is running!',
        version: '1.0.2',
        status: 'operational',
        currentModel: getCurrentModelUrl(),
        availableModels: MODEL_URLS.length,
        endpoints: {
            chat: 'POST /api/chat',
            health: 'GET /health',
            models: 'GET /models'
        }
    });
});

app.get('/models', (req, res) => {
    res.json({
        currentModel: getCurrentModelUrl(),
        allModels: MODEL_URLS,
        currentIndex: currentModelIndex
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
            return res.json({ 
                answer: cachedResponse, 
                source: 'cache',
                model: 'cached'
            });
        }

        // Try Hugging Face API
        console.log('Querying Hugging Face API...');
        let answer = await queryHuggingFace(cleanQuestion);
        let source = 'ai';
        let modelUsed = getCurrentModelUrl();

        // If API failed, use fallback
        if (answer === null || answer.length < 5) {
            console.log('Using fallback response');
            answer = getFallbackResponse(cleanQuestion);
            source = 'fallback';
            modelUsed = 'fallback';
        }

        // Final cleanup
        answer = answer.trim();
        if (answer === '') {
            answer = "I'd be happy to help you learn about Metropolia's Urban Farm Lab. What would you like to know?";
            source = 'fallback';
        }
        
        // Cache the response
        cache.set(cleanQuestion, answer);
        console.log('Response generated successfully');

        res.json({ 
            answer: answer,
            source: source,
            model: modelUsed
        });

    } catch (error) {
        console.error('Chat endpoint error:', error);
        
        // Fallback response
        const fallbackAnswer = getFallbackResponse(req.body.question || '');
        res.json({ 
            answer: fallbackAnswer,
            source: 'fallback',
            model: 'error',
            error: 'Service temporarily using fallback responses'
        });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Test the API connection
        const testAnswer = await queryHuggingFace("What is Urban Farm Lab?");
        const apiStatus = testAnswer && testAnswer.length > 10 ? 'healthy' : 'degraded';
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            apiStatus: apiStatus,
            currentModel: getCurrentModelUrl(),
            cacheSize: cache.keys().length
        });
    } catch (error) {
        res.json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            apiStatus: 'unavailable',
            message: 'Using fallback mode',
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Chatty AI Backend running on port ${PORT}`);
    console.log(`🔑 API Key: ${HF_API_KEY ? 'Set' : 'Missing!'}`);
    console.log(`🤖 Available models: ${MODEL_URLS.length}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});