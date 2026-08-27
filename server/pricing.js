// Pricing helpers (pure functions)

function priceFor(pricing, provider, modelName) {
  const mk = `${provider}/${modelName}`;
  const mo = pricing.models && pricing.models[mk];
  if (mo && typeof mo.input === "number" && typeof mo.output === "number") return mo;
  const po = (pricing.providers && pricing.providers[provider]) || {};
  return { input: typeof po.input === "number" ? po.input : 0, output: typeof po.output === "number" ? po.output : 0 };
}

function computeCost(price, promptTok, completionTok) {
  return (promptTok * price.input + completionTok * price.output) / 1e6;
}

module.exports = { priceFor, computeCost };
