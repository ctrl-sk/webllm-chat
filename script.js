// Import removed, using global window.QUESTION_FLOWS loaded from index.html

let webllm = null;

// DOM Elements
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusIndicator = document.getElementById('status-indicator');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const modelInfo = document.getElementById('model-info');

// Configuration
const MODELS = [
    {
        id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
        name: "Qwen 2.5 1.5B",
        local_id: "qwen2.5_mlc",
        description: "Chat bot that runs locally in your browser to help you write a detailed creative brief.",
        performance_notes: "Very fast, low memory usage (~2GB VRAM)."
    }
];

// CDN Fallback sources - will try in order
const MODEL_SOURCES = [
    {
        name: "Local",
        baseUrl: "./",
        description: "Local files"
    },
    {
        name: "Hugging Face (Default)",
        baseUrl: null, // null means use default web-llm configuration
        description: "Primary source"
    }
];

let engine = null;

// State Management
const STATE = {
    IDLE: 'IDLE',
    COLLECTING: 'COLLECTING',
    FOLLOW_UP: 'FOLLOW_UP' // New state for dynamic clarification
};

let chatState = STATE.IDLE;
let currentCategory = null;
let currentQuestionIndex = 0;
let collectedAnswers = [];
let pendingFollowUpQuestion = null; // Store the follow-up question text


// Initialize WebLLM
async function init() {
    // Ensure input is disabled until model is loaded
    disableInput();

    // Auto-load the only model
    const startModelId = MODELS[0].id;
    updateModelInfo(startModelId);
    await loadEngine(startModelId);

    // Initial bot message logic handled after load
}

function updateModelInfo(modelId) {
    const model = MODELS.find(m => m.id === modelId);
    if (model) {
        modelInfo.innerHTML = `
            <div>${model.description}</div>
            <span class="model-note">Note: ${model.performance_notes}</span>
        `;
    }
}

async function tryLoadEngineFromSource(modelId, source, initProgressCallback) {
    if (!webllm) {
        webllm = await import("./web-llm.js");
    }

    // If baseUrl is null, use default configuration
    if (source.baseUrl === null) {
        return await webllm.CreateMLCEngine(
            modelId,
            { initProgressCallback: initProgressCallback }
        );
    }

    // Create custom AppConfig
    let modelLib = `${source.baseUrl}${modelId}/${modelId}-ctx4k_cs1k-webgpu.wasm`;
    let modelPath = `${source.baseUrl}${modelId}/`;
    let targetModelId = modelId;

    // Handle Local source specifically
    if (source.name === "Local") {
        const modelDef = MODELS.find(m => m.id === modelId);
        const localId = modelDef?.local_id || modelId;
        modelPath = new URL(`${source.baseUrl}${localId}/`, window.location.href).href;

        // Use a distinct ID for local loading to prevent conflict with prebuilt registry
        targetModelId = `${modelId}-Local`;

        // Force use of local WASM file
        console.log("Using local WASM file for offline capability.");
        modelLib = new URL(`${source.baseUrl}${localId}/${localId}-ctx4k_cs1k-webgpu.wasm`, window.location.href).href;
    }

    const appConfig = {
        model_list: [
            {
                model: modelPath,
                model_id: targetModelId,
                model_lib: modelLib
            }
        ]
    };

    return await webllm.CreateMLCEngine(
        targetModelId,
        {
            initProgressCallback: initProgressCallback,
            appConfig: appConfig
        }
    );
}

async function loadEngine(modelId) {
    disableInput();
    const modelName = MODELS.find(m => m.id === modelId).name;
    statusIndicator.textContent = "Loading " + modelName + "...";
    statusIndicator.className = 'status-indicator'; // Reset classes
    progressContainer.classList.add('visible');
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    const initProgressCallback = (report) => {
        // console.log(report); // Reduce verbosity
        const progress = report.progress;
        const text = report.text;

        if (report.progress !== undefined) {
            const percentage = Math.round(report.progress * 100);
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = text;
        } else {
            progressText.textContent = text;
        }
    };

    // Try each source in order until one succeeds
    let lastError = null;
    for (let i = 0; i < MODEL_SOURCES.length; i++) {
        const source = MODEL_SOURCES[i];

        try {
            console.log(`Attempting to load model from: ${source.name}`);
            progressText.textContent = `Trying ${source.name}...`;

            engine = await tryLoadEngineFromSource(modelId, source, initProgressCallback);

            // Success!
            statusIndicator.textContent = "Ready";
            statusIndicator.classList.add('ready');
            progressContainer.classList.remove('visible');
            enableInput();
            console.log(`Engine initialized successfully from ${source.name}`);

            // Custom welcome message
            appendMessage('bot', "Hello! I can help you create a detailed support request for:\n- Video\n- Graphics\n- UI/UX\n- Copy Writing\n\nWhat kind of project do you need help with?");

            return;

        } catch (error) {
            console.error(`Failed to load from ${source.name}:`, error);
            lastError = error;

            // If this isn't the last source, try the next one
            if (i < MODEL_SOURCES.length - 1) {
                console.log(`Falling back to next source...`);
                progressText.textContent = `${source.name} failed, trying next source...`;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause before retry
            }
        }
    }

    // All sources failed
    console.error("All sources failed. Last error:", lastError);
    statusIndicator.textContent = "Error: All sources failed to load model";
    statusIndicator.classList.add('error');
    progressText.textContent = "Failed to load model from all sources. Check console for details.";
}

// UI Helpers
function enableInput() {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
}

function disableInput() {
    userInput.disabled = true;
    sendBtn.disabled = true;
}

function appendMessage(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'user-message' : 'bot-message'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Simple markdown-ish rendering for checks/bold
    contentDiv.innerText = text;

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return contentDiv;
}

function appendLoadingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.style.backgroundColor = 'transparent'; // Optional: remove background if bubble has one by default
    contentDiv.style.padding = '0'; // Optional: remove padding for image

    const img = document.createElement('img');
    img.src = 'images/Ripple_Clarifying.gif';
    img.style.width = '100px';
    img.alt = 'Thinking...';

    contentDiv.appendChild(img);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return contentDiv;
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function createDownloadButton(filename, content) {
    // Convert markdown content to Docx blob
    const doc = markdownToDocx(content);
    const blob = await docx.Packer.toBlob(doc);
    const url = window.URL.createObjectURL(blob);

    const button = document.createElement('a');
    button.href = url;
    // Ensure filename ends with .docx
    button.download = filename.replace(/\.(txt|md)$/, "") + ".docx";
    button.className = 'download-btn';
    button.textContent = '📄 Download detailed brief (Word)';
    button.style.display = 'inline-block';
    button.style.backgroundColor = '#cf4500';
    button.style.color = 'white';
    button.style.padding = '10px 20px';
    button.style.textAlign = 'center';
    button.style.textDecoration = 'none';
    button.style.borderRadius = '9999px';
    button.style.marginTop = '10px';
    button.style.cursor = 'pointer';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.appendChild(button);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function markdownToDocx(markdownText) {
    const lines = markdownText.split('\n');
    const children = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('# ')) {
            // Heading 1
            children.push(new docx.Paragraph({
                text: line.substring(2),
                heading: docx.HeadingLevel.HEADING_1,
                spacing: { before: 200, after: 100 }
            }));
        } else if (line.startsWith('## ')) {
            // Heading 2
            children.push(new docx.Paragraph({
                text: line.substring(3),
                heading: docx.HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 100 }
            }));
        } else if (line.startsWith('### ')) {
            // Heading 3
            children.push(new docx.Paragraph({
                text: line.substring(4),
                heading: docx.HeadingLevel.HEADING_3,
                spacing: { before: 100, after: 50 }
            }));
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            // Bullet list
            // Handle bold text in list items (**text**)
            const textParts = parseBoldText(line.substring(2));
            children.push(new docx.Paragraph({
                children: textParts,
                bullet: { level: 0 }
            }));
        } else {
            // Normal paragraph
            const textParts = parseBoldText(line);
            children.push(new docx.Paragraph({
                children: textParts,
                spacing: { after: 100 }
            }));
        }
    }

    return new docx.Document({
        sections: [{
            properties: {},
            children: children
        }]
    });
}

function parseBoldText(text) {
    const parts = [];
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Text before the bold part
        if (match.index > lastIndex) {
            parts.push(new docx.TextRun(text.substring(lastIndex, match.index)));
        }
        // The bold part
        parts.push(new docx.TextRun({
            text: match[1],
            bold: true
        }));
        lastIndex = regex.lastIndex;
    }
    // Remaining text
    if (lastIndex < text.length) {
        parts.push(new docx.TextRun(text.substring(lastIndex)));
    }
    return parts;
}

// AI Logic Steps

// 1. Determine Category
async function determineCategory(text) {
    const prompt = `
    Classify the following user input into one of these exact categories: "video", "graphics", "ui/ux", "copy writing".
    
    User Input: "${text}"
    
    If the input matches one of the categories clearly, return ONLY the category name in lowercase.
    If the input is completely unrelated to creative projects (e.g. general questions, math, coding, casual chat), return "unrelated".
    If it is a creative request but unclear which category, return "unknown".
    `;

    const response = await engine.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.2
    });

    const category = response.choices[0].message.content.trim().toLowerCase();

    if (category.includes("video")) return "video";
    if (category.includes("graphic")) return "graphics";
    if (category.includes("ui") || category.includes("ux")) return "ui/ux";
    if (category.includes("copy") || category.includes("writing")) return "copy writing";

    if (category.includes("unrelated")) return "unrelated";

    return "unknown";
}

// 2. Check Answer Sufficiency (Dynamic Follow-up)
async function checkAnswerSufficiency(question, answer) {
    const wordCount = answer.trim().split(/\s+/).length;
    let contextNote = "";
    if (wordCount < 2) {
        contextNote = "\n    [SYSTEM NOTE: The user's answer is very short (less than 2 words). Unless it is a precise number or standard term, it is likely INSUFFICIENT. Be critical.]";
    }

    const prompt = `
    You are a collaborative Creative Director helper. Your goal is to ensure the user provides enough detail to start a creative brief, but you make sure you do not accept vague requirements.

    Question asked: "${question}"
    User answer: "${answer}"${contextNote}

    Is this answer detailed enough to be a good STARTING POINT?
    
    CRITERIA for "VALID_ANSWER":
    - It provides at least one specific detail relevant to the question.
    - It is not complete nonsense or a refusal to answer.
    - If it's a partial answer, return a specific content-related follow-up question to key details.
    
    If it is a reasonable start, return "VALID_ANSWER".
    If it is completely insufficient (e.g. less than 2 words, or "I don't know", or unrelated), return a specific content-related follow-up question to key details.
    
    IMPORTANT OUTPUT RULES:
    - Do NOT include labels like "Follow-up question:" or "Invalid answer:".
    - Just output the follow-up question text directly if needed.
    - If valid, just output "VALID_ANSWER".
    `;

    // console.log("Checking sufficiency for:", answer); 

    const response = await engine.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature: 0.1 // Keep it low for stability
    });

    const result = response.choices[0].message.content.trim();
    // console.log("Sufficiency Result:", result);

    if (result.includes("VALID_ANSWER")) {
        return "STATUS_PASS";
    }
    return result; // The follow-up question
}

// 3. Generate Detailed Brief (Elaboration)
async function generateDetailedBrief(answers, category) {
    const formattedAnswers = answers.map(a => `- **Question**: ${a.question}\n  **User Input**: ${a.answer}`).join('\n\n');

    const prompt = `
    You are an expert Creative Director. Create a comprehensive, professional Creative Brief for a "${category}" project based on the user's inputs.
    
    USER ENTRIES:
    ${formattedAnswers}
    
    INSTRUCTIONS:
    1. Structure the brief with clear headers (Objective, Audience, Specs, etc.).
    2. For each section, you MUST use your expertise to EXPAND and ELABORATE on the user's answers. 
       For example:
       - If they said "blue", expand to "Primary Color Palette: Blue, suggesting trust and professionalism..."
       - If they said "fast", expand to "Pacing/Timing: Fast-paced editing style to maintain high energy..."
    3. Make it sound like a formal agency document.
    4. Do not invent facts, but interpret the user's intent with professional terminology.
    5. Use logic to fill in standard professional requirements that are implied by the user's answers (e.g., if they asked for a 'social media video', imply '1080x1920, MP4, sRGB').
    `;

    // Stream the summary
    const botMessageContent = appendMessage('bot', 'Drafting your detailed Master Creative Brief...');
    let fullResponse = "";

    try {
        const chunks = await engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            stream: true,
            temperature: 0.7 // Higher temp for creative elaboration
        });

        for await (const chunk of chunks) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullResponse += content;
            botMessageContent.innerText = fullResponse;
            scrollToBottom();
        }

        // After streaming is done, offer download
        createDownloadButton(`Creative_Brief_${category}_${Date.now()}.txt`, fullResponse);

    } catch (error) {
        console.error("Summary generation error:", error);
        botMessageContent.innerText += "\n[Error generating summary]";
    }
}


// Chat Logic
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text || !engine) return;

    // User message
    appendMessage('user', text);
    userInput.value = '';
    disableInput();

    try {
        if (chatState === STATE.IDLE) {
            const botMessageContent = appendLoadingIndicator();
            const category = await determineCategory(text);
            // Remove the temporary "Thinking..." message or update it
            if (botMessageContent && botMessageContent.parentElement) {
                messagesContainer.removeChild(botMessageContent.parentElement);
            }

            if (category === 'unrelated') {
                appendMessage('bot', "I apologize, but I can only assist with Creative Support requests (Video, Graphics, UI/UX, Copy Writing). I cannot answer unrelated questions.");
            } else if (category !== 'unknown' && window.QUESTION_FLOWS[category]) {
                chatState = STATE.COLLECTING;
                currentCategory = category;
                currentQuestionIndex = 0;
                collectedAnswers = [];

                appendMessage('bot', `Great! Let's get the details for your ${category} request.\n\n${window.QUESTION_FLOWS[currentCategory][0]}`);
            } else {
                appendMessage('bot', "I'm not sure which creative category that falls into. Please specify if you need help with:\n- Video\n- Graphics\n- UI/UX\n- Copy Writing");
            }

        } else if (chatState === STATE.COLLECTING) {
            // Check sufficiency
            const currentQ = window.QUESTION_FLOWS[currentCategory][currentQuestionIndex];

            // Temporary helper message
            const thinkingMsg = appendLoadingIndicator();
            const analysis = await checkAnswerSufficiency(currentQ, text);
            if (thinkingMsg && thinkingMsg.parentElement) {
                messagesContainer.removeChild(thinkingMsg.parentElement);
            }

            if (analysis === "STATUS_PASS") {
                // Determine complete answer (could include previous follow-ups, but for now just this text)
                collectedAnswers.push({
                    question: currentQ,
                    answer: text
                });

                // Move to next
                currentQuestionIndex++;
                if (currentQuestionIndex < window.QUESTION_FLOWS[currentCategory].length) {
                    appendMessage('bot', window.QUESTION_FLOWS[currentCategory][currentQuestionIndex]);
                } else {
                    chatState = STATE.IDLE;
                    await generateDetailedBrief(collectedAnswers, currentCategory);
                    currentCategory = null;
                }
            } else {
                // Need follow-up
                chatState = STATE.FOLLOW_UP;
                pendingFollowUpQuestion = analysis; // The LLM returned a question
                // Store partial answer context to append later? 
                // For simplicity: We treat the connection as "User said X, we ask Y, User says Z".
                // We will combine X and Z as the final answer.
                collectedAnswers.push({
                    question: currentQ,
                    answer: text + " (Clarification needed)"
                });

                appendMessage('bot', `could you elaborate? ${analysis}`);
            }

        } else if (chatState === STATE.FOLLOW_UP) {
            // User answered the follow-up
            // Update the last collected answer to include this clarification
            const lastEntry = collectedAnswers[collectedAnswers.length - 1];
            lastEntry.answer = `${lastEntry.answer} -> Clarification: ${text}`;

            // Resume main flow
            chatState = STATE.COLLECTING;
            currentQuestionIndex++;

            if (currentQuestionIndex < window.QUESTION_FLOWS[currentCategory].length) {
                appendMessage('bot', window.QUESTION_FLOWS[currentCategory][currentQuestionIndex]);
            } else {
                chatState = STATE.IDLE;
                await generateDetailedBrief(collectedAnswers, currentCategory);
                currentCategory = null;
            }
        }

    } catch (error) {
        console.error("Interaction error:", error);
        appendMessage('bot', "Sorry, I encountered an error. Please try again.");
    } finally {
        enableInput();
    }
});

// Start initialization
init();

