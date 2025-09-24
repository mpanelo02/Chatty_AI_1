const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Simple reliable fallback - no external API
function getAIResponse(question) {
    const lowerQ = question.toLowerCase();
    
    if (lowerQ.includes('urban farm') || lowerQ.includes('farm lab')) {
        return "The Urban Farm Lab at Metropolia is a collaborative platform focusing on sustainable urban agriculture. It brings together students, researchers, and industry partners to develop innovative solutions for food production in urban environments.";
    } else if (lowerQ.includes('metropolia')) {
        return "Metropolia University of Applied Sciences is Finland's largest university of applied sciences. The Urban Farm Lab is one of its research platforms focusing on sustainable food production.";
    } else if (lowerQ.includes('andrea')) {
        return "Andrea is likely a researcher at the Urban Farm Lab. For specific information, please check Metropolia's official website.";
    } else {
        return "I'm Chatty, your Urban Farm Lab assistant! I can help you learn about sustainable urban agriculture, research projects, and Metropolia's initiatives in this area.";
    }
}

app.post('/api/chat', (req, res) => {
    const { question } = req.body;
    const answer = getAIResponse(question || '');
    res.json({ answer, source: 'local' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));