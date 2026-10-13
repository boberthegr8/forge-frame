// GET /api/ai/status
// Lets the page know, on load, whether AI features are usable, without ever
// exposing the key itself. The page should hide its AI buttons when enabled is false.

module.exports = async (req, res) => {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const enabled = provider === 'gemini'
    ? Boolean(process.env.GEMINI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
  res.status(200).json({ enabled, provider });
};
