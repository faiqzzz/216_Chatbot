const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {

    res.redirect.static("index.html");

});



app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || !Array.isArray(message)){
            return res.status(400).json({
                 error: "Message harus berupa Array" 
                });
        }

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            {
                method: "POST",
                
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gemini-3.8-flash",
                    messages: message,
                    temperature: 0.7,
                    max_tokens: 1000,
                    stream: true,
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error("OpenRouter Error:", errorData);
            return res.status(response.status).json({error: errorData});
        }

        //header untuk streaming
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, {
                 stream: true 
                });
                const lines = buffer.split("\n");
                buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();

                if(!trimmedLine) {
                    continue;
                }
                if (!trimmedLine.startsWith("data:")) {
                    continue;
                }

                const data = trimmedLine.slice(5).trim();
                if (data === "[DONE]") {
                    continue;
                }

                try {

                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) {
                        res.write(`data: ${JSON.stringify({ content })}\n\n`);
                    }
                } catch (error) {
                    console.error("Error parsing JSON:", error);
                }
            }
        }
        res.write("data: [DONE]\n\n");
        res.end();

    } catch (error) {
        console.error("Server Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal Server Error" });
        }else {
            res.write(`data: ${JSON.stringify({ error: "Internal Server Error" })}\n\n`);
        res.end();
        }
    }

});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;