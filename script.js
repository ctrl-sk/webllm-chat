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
const modelSelector = document.getElementById('model-selector');
const modelInfo = document.getElementById('model-info');

// Configuration
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
const MODEL_NAME = "Qwen 2.5 0.5B";
const LOCAL_FOLDER_NAME = "qwen2.5-0.5B_mlc";

let engine = null;

// Initialize WebLLM
async function init() {
    statusIndicator.textContent = "Loading " + MODEL_NAME + "...";
    statusIndicator.classList.remove('ready', 'error');

    // Start loading immediately
    loadEngine();
}

async function loadEngine() {
    disableInput();
    progressContainer.classList.add('visible');
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    const initProgressCallback = (report) => {
        console.log(report);
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

    try {
        if (!webllm) {
            webllm = await import("https://esm.run/@mlc-ai/web-llm");
        }

        console.log(`Attempting to load model: ${MODEL_NAME}`);
        progressText.textContent = `Resolving WASM...`;

        // Dynamically find correct WASM from prebuilt config
        let wasmUrl = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Qwen2.5-0.5B-Instruct-q4f32_1-MLC-1k.wasm"; // Default fallback
        try {
            const defaultConfig = webllm.prebuiltAppConfig;
            const defaultModel = defaultConfig.model_list.find(m => m.model_id === MODEL_ID);
            if (defaultModel) {
                wasmUrl = defaultModel.model_lib;
                console.log(`Using remote WASM from config: ${wasmUrl}`);
            } else {
                console.warn(`Model ${MODEL_ID} not found in prebuiltAppConfig, using fallback WASM: ${wasmUrl}`);
            }
        } catch (e) {
            console.warn("Could not fetch prebuiltAppConfig, using fallback WASM", e);
        }

        progressText.textContent = `Initializing...`;

        // Configure to use local weights and remote WASM
        const appConfig = {
            model_list: [
                {
                    model: new URL(LOCAL_FOLDER_NAME + "/", window.location.href).href,
                    model_id: MODEL_ID,
                    model_lib: wasmUrl
                }
            ]
        };

        engine = await webllm.CreateMLCEngine(
            MODEL_ID,
            {
                initProgressCallback: initProgressCallback,
                appConfig: appConfig
            }
        );

        // Success!
        statusIndicator.textContent = "Ready (" + MODEL_NAME + ")";
        statusIndicator.classList.add('ready');
        progressContainer.classList.remove('visible');
        enableInput();

        // Show model info
        modelInfo.innerHTML = `
            <div><strong>${MODEL_NAME}</strong>: Alibaba's efficient 0.5B model, optimized for speed.</div>
        `;

        console.log(`Engine initialized successfully.`);

    } catch (error) {
        console.error(`Failed to load model:`, error);
        statusIndicator.textContent = "Error: Failed to load model";
        statusIndicator.classList.add('error');
        progressText.textContent = "Failed to load model. Check console for details.";
    }
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
    // Simple text for now, could add markdown parsing later if needed
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return contentDiv; // Return for streaming updates
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

    // Bot message placeholder
    const botMessageContent = appendMessage('bot', '...');
    let fullResponse = "";

    try {
        const chunks = await engine.chat.completions.create({
            messages: [
                { role: "user", content: text }
            ],
            stream: true,
        });

        for await (const chunk of chunks) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullResponse += content;
            botMessageContent.textContent = fullResponse;
            scrollToBottom();
        }
    } catch (error) {
        console.error("Chat error:", error);
        botMessageContent.textContent += "\n[Error generating response]";
    } finally {
        enableInput();
    }
});

// Start initialization
init();
