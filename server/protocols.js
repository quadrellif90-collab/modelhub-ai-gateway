// Protocol adapters (entrante -> OpenAI; uscente OpenAI -> protocollo)

function anthropicToOpenAI(body) {
  const messages = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  for (const msg of (body.messages || [])) {
    messages.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content });
  }
  return {
    model: body.model,
    messages,
    max_tokens: body.max_tokens || 1024,
    temperature: body.temperature,
    stream: body.stream === true,
    stop: body.stop
  };
}

function openAIToAnthropic(data, model) {
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  const usage = data.usage || {};
  return {
    id: data.id || "msg_" + Date.now(),
    type: "message",
    role: "assistant",
    model: model,
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0 }
  };
}

function geminiGenerateToOpenAI(model, body) {
  const messages = [];
  for (const c of (body.contents || [])) {
    const role = c.role === "model" ? "assistant" : "user";
    const text = (c.parts || []).map(p => p.text || "").join("");
    messages.push({ role, content: text });
  }
  return {
    model,
    messages,
    max_tokens: (body.generationConfig && body.generationConfig.maxOutputTokens) || 1024,
    stream: body.generationConfig && body.generationConfig.stream === true,
    temperature: body.generationConfig && body.generationConfig.temperature
  };
}

function openAIToGemini(data, finishReason) {
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  const usage = data.usage || {};
  const map = { stop: "STOP", length: "MAX_TOKENS", content_filter: "SAFETY" };
  const fr = finishReason ? map[finishReason] || "OTHER" : undefined;
  return {
    candidates: [{ content: { parts: [{ text }], role: "model" }, ...(fr ? { finishReason: fr } : {}) }],
    usageMetadata: { promptTokenCount: usage.prompt_tokens || 0, candidatesTokenCount: usage.completion_tokens || 0 }
  };
}

function ollamaChatToOpenAI(body) {
  return {
    model: body.model,
    messages: body.messages || [],
    stream: body.stream === true,
    max_tokens: (body.options && body.options.num_predict) || 1024,
    temperature: body.options && body.options.temperature
  };
}

function openAIToOllama(data, model) {
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return {
    model,
    message: { role: "assistant", content: text },
    done: true
  };
}

module.exports = {
  anthropicToOpenAI,
  openAIToAnthropic,
  geminiGenerateToOpenAI,
  openAIToGemini,
  ollamaChatToOpenAI,
  openAIToOllama
};
