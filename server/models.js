// Model classification (pure functions, no global state)

function classify(id) {
  // Mirato: solo modelli VERAMENTE reasoning/coding/fast, niente falsi positivi di
  // sottostringhe (es. "minimax-m2" o "kimi-k2" non sono coding, "deepseek-v3" no, ecc).
  const reasoning = /\b(r1|reason(er|ing)?|thinking|o1|o3|o4|-o1-|qwq|qwen-?3-32b|nemotron-3-ultra|glm-4-5|deepseek-r1|deepseek-v3\.1-terminus|kimi-k2-thinking|kimi-k2\.5|kimi-k2\.6|kimi-k2\.7|qwen-?3-?max-thinking|arcee.*trinity|inkling|nex-n2)\b/i.test(id);
  const code = /\b(cod(e|ing|er)|devstral|starcoder|codestral|coder|codex|kat-coder|seed-2\.0-code|seed-2\.1-code|poolside\/laguna|qwen3?-?coder|qwen-?2\.5-coder|glm-.*code|kimi.*-?code|hermes-4|doubao-seed-2\.0-code|hy3|llama-4-scout|llama-4-maverick)\b/i.test(id);
  const fast = /\b(8b|flash-lite|flash-lite|mini|turbo|small|lightning|nano|instant|1\.5-flash|70b-instruct|8b-instruct|qwen-turbo|solar-mini|gemma|ministral|llama-?3\.1-8b|llama-?3\.2-3b|llama-?3\.3-8b|hunyuan-a13b)\b/i.test(id);
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
