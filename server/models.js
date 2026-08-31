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

function classifyPrompt(text, opts) {
  // Intent detection evoluta (IT + EN), multilivello e pesata.
  // opts.messages = cronologia completa (opzionale) per contesto.
  const t = String(text || "").trim();
  const msgs = (opts && Array.isArray(opts.messages)) ? opts.messages : [];
  const allTxt = msgs.map(m => (typeof m.content === "string" ? m.content : JSON.stringify(m.content || ""))).join("\n") + "\n" + t;
  const lc = t.toLowerCase();

  // --- CODE: pattern multilingua (IT/EN/tech) ---
  const CODE_PATTERNS = [
    /\b(code|codice|function|funzione|def\s|class\s|import\s|SELECT\s|regex|bug|refactor|rifattorizza|compila|compile|script|endpoint|api|kotlin|java|python|typescript|javascript|\bcss\b|\bhtml\b|\bsql\b|\bc\+\+\b|go\s|rust|php|ruby|shell|bash|docker|kubernetes|git\s|debug|test unitari|unit test|algoritmo|framework|libreria|dependency|dipendenza|snippet)\b/i,
    /\b(scrivi|crea|genera|fixa|correggi|implementa|ottimizza|riscrivi)\b[\s\S]{0,40}\b(codice|funzione|classe|script|programma|query|componente|modulo|api|endpoint)\b/i,
    /[;{}]\s*$/,                         // termina con blocco/codice
    /^\s*(import|from|const|let|var|def|class|function|SELECT|public|private|#include|package)\b/m,  // sembra codice sorgente
    /```/,                              // code fence
  ];
  const code = CODE_PATTERNS.some(p => p.test(t)) || CODE_PATTERNS.some(p => p.test(allTxt.slice(-2000)));

  // --- REASONING: analisi, spiegazione, pianificazione (IT/EN) ---
  const REASON_PATTERNS = [
    /\b(why|perché|perché|explain|spiega|spiegami|reason|ragiona|step[- ]by[- ]step|passo passo|prove|dimostra|analyze|analizza|compare|confronta|trade[- ]?off|math|matematica|logic|logica|plan|piano|strategia|strategy|hypothesis|ipotesi|derive|deduci|valuta|pro e contro|pros and cons|fai un'analisi|ragionamento)\b/i,
    /\b(qual[ei]?'?\s*(è|sono|sarebbe)\s+(la|le|il|lo)?\s*(differenza|miglior|peggior|motivo|ragione|causa|vantaggio|svantaggio))\b/i,
    /\b(quale|quali)\b[\s\S]{0,40}\b(è|sono|scegliere|scegli|scelgo|preferire|conviene)\b/i,
    /\b(come\s+(funziona|si\s+calcola|si\s+fa|ottimizzo|miglioro|funzionano))\b/i,
  ];
  const reasoning = REASON_PATTERNS.some(p => p.test(t)) || REASON_PATTERNS.some(p => p.test(allTxt.slice(-2000)));

  // --- CREATIVE / WRITING: testo, non codice ---
  const CREATIVE_PATTERNS = [
    /\b(scrivi|redigi|componi|poesia|racconto|articolo|blog|post|email|lettera|slogan|frase|paragrafo|traduci|riassumi|riassunto|copywrite|marketing|testo|trama|sceneggiatura)\b/i,
    /\b(write|compose|poem|story|article|blog|email|letter|slogan|paragraph|translate|summar|summary|essay|script|rewrite|paraphrase)\b/i,
  ];
  const creative = CREATIVE_PATTERNS.some(p => p.test(t)) && !code;

  // --- VISION: immagine + azione ---
  const vision = /\b(image|immagine|picture|photo|foto|diagram|diagramma|ocr|screenshot|cattura|visual|figura)\b/i.test(t) &&
                 /(describe|descrivi|leggi|read|extract|estrai|transcribe|trascrivi|cosa\s+c'?è|what'?s\s+in|analyse\s+the\s+image)/i.test(t);

  // --- DATA: tabelle, CSV, JSON, analisi dati ---
  const data = /\b(csv|json|tabella|table|dataset|dati|dataframe|excel|pivot|grafico|chart|statistica|statistic|aggrega|group by|sql)\b/i.test(t) && !/^import|```/.test(t);

  // --- FAST: breve, né code né reasoning né creative ---
  const fast = t.length < 60 && !code && !reasoning && !creative && !vision && !data;

  // Score pesato per decidere il profilo dominante (utile per estensioni future)
  const score = {
    code: code ? 1 : 0,
    reasoning: reasoning ? 1 : 0,
    creative: creative ? 1 : 0,
    vision: vision ? 1 : 0,
    data: data ? 1 : 0,
    fast: fast ? 1 : 0
  };

  return {
    code, reasoning, creative, vision, data, fast,
    general: !code && !reasoning && !creative && !vision && !data && !fast,
    score
  };
}

function catFirst(ids, pred) {
  return [...ids.filter(id => pred(classify(id))), ...ids.filter(id => !pred(classify(id)))];
}

module.exports = { classify, classifyPrompt, CHAT_BLOCK, catFirst };
