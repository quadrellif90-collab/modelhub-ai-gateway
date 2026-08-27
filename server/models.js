// Model classification (pure functions, no global state)

function classify(id) {
  const reasoning = /reason|r1|reasoner|thinking|\bo[13]\b|-o1-|qwq|nemotron-3-ultra|deepseek-v3|qwen-3-32b|glm-4-5/i.test(id);
  const code = /cod(e|ing|er)|devstral|starcoder|deepseek-v3|glm-4-5|kimi-k2|minimax-m2|qwen-?2?\.?5?-?coder|qwen3-coder/i.test(id);
  const fast = /8b|flash-lite|mini|turbo|small|lightning|nano|instant|1\.5-flash|70b-instruct|8b-instruct|qwen-turbo|solar-mini|gemma2|ministral|llama3\.1-8b/i.test(id);
  return { reasoning, code, fast };
}

const CHAT_BLOCK = /guard|safeguard|content-safety|prompt-guard|moderation|moderat|align|nemo-guard|reward|classif|detect|embed|rerank|vision-only|instruct-flash-(?!chat)|reasoning-guard|jailbreak|toxicity/i;

function classifyPrompt(text) {
  const t = String(text || "");
  const code = /\b(code|function|def |class |import |SELECT |regex|bug|refactor|compile|script|API|endpoint|kotlin|java|python|typescript)\b/i.test(t) || /[;{}]\s*$/.test(t.trim());
  const reasoning = /\b(why|explain|reason|step[- ]by[- ]step|prove|analyze|compare|trade[- ]?off|math|logic|plan|strategy|hypothesis)\b/i.test(t);
  const vision = /\b(image|picture|photo|diagram|ocr|screenshot|visual)\b/i.test(t) && /(describe|read|extract|transcribe)/i.test(t);
  const fast = t.length < 60 && !code && !reasoning;
  return { code, reasoning, vision, fast, general: !code && !reasoning && !vision };
}

function catFirst(ids, pred) {
  return [...ids.filter(id => pred(classify(id))), ...ids.filter(id => !pred(classify(id)))];
}

module.exports = { classify, classifyPrompt, CHAT_BLOCK, catFirst };
