const chatFeed = document.getElementById("chatFeed");
const emptyState = document.getElementById("emptyState");
const chatForm = document.getElementById("chatForm");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

let conversationHistory = [];
let isGenerating = false;

// Auto-resize textarea
promptInput.addEventListener("input", () => {
    promptInput.style.height = "auto";
    promptInput.style.height = `${promptInput.scrollHeight}px`;
});

// Submit dengan Enter (Shift+Enter untuk baris baru)
promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatForm.requestSubmit();
    }
});

// Reset percakapan
clearBtn.addEventListener("click", () => {
    if (isGenerating) return;
    conversationHistory = [];
    chatFeed.innerHTML = "";
    chatFeed.appendChild(emptyState);
    statusText.textContent = "Sesi dibersihkan";
    setTimeout(() => {
        if (!isGenerating) statusText.textContent = "Siap menerima instruksi";
    }, 1500);
});

// Format teks agar blok kode (```) dan inline code (`) tampil rapi & aman dari XSS
function renderFormattedText(rawText) {
    const escaped = rawText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Render blok kode ```...```
    const withCodeBlocks = escaped.replace(
        /```(?:\w+)?\n([\s\S]*?)```/g,
        "<pre><code>$1</code></pre>"
    );

    // Render inline code `...`
    return withCodeBlocks.replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function appendMessage(role, initialText = "") {
    if (emptyState.parentNode) {
        emptyState.remove();
    }

    const row = document.createElement("div");
    row.className = `msg-row ${role}`;

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = role === "user" ? "Anda" : "Assistant";

    const content = document.createElement("div");
    content.className = "msg-content";

    if (role === "user") {
        content.textContent = initialText;
    } else {
        content.innerHTML = renderFormattedText(initialText);
    }

    row.appendChild(meta);
    row.appendChild(content);
    chatFeed.appendChild(row);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    return content;
}

function setUIState(generating) {
    isGenerating = generating;
    sendBtn.disabled = generating;
    promptInput.disabled = generating;
    statusDot.classList.toggle("streaming", generating);
    statusText.textContent = generating
        ? "Sedang menulis respons..."
        : "Siap menerima instruksi";
}

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = promptInput.value.trim();
    if (!text || isGenerating) return;

    promptInput.value = "";
    promptInput.style.height = "auto";

    appendMessage("user", text);
    conversationHistory.push({ role: "user", content: text });

    const assistantContentEl = appendMessage("assistant", "");
    let fullAssistantReply = "";

    setUIState(true);

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: conversationHistory
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP Error ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;

                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") continue;

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        throw new Error(parsed.error);
                    }
                    if (parsed.content) {
                        fullAssistantReply += parsed.content;
                        assistantContentEl.innerHTML = renderFormattedText(fullAssistantReply);
                        chatFeed.scrollTop = chatFeed.scrollHeight;
                    }
                } catch (err) {
                    console.error("Stream parse error:", err);
                }
            }
        }

        if (fullAssistantReply) {
            conversationHistory.push({
                role: "assistant",
                content: fullAssistantReply
            });
        }
    } catch (error) {
        assistantContentEl.textContent = `[Error: ${error.message}]`;
        conversationHistory.pop();
    } finally {
        setUIState(false);
        promptInput.focus();
    }
});