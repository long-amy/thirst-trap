export async function analyzePlantHealth(imageBase64, mimeType, userNote) {
  const content = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: imageBase64,
      },
    },
  ];

  if (userNote?.trim()) {
    content.push({ type: 'text', text: userNote.trim() });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a plant health expert. The user will share a photo of their plant and optionally describe what they\'re seeing. Respond in 2-3 short plain text sentences — no markdown, no bullet points, no headers. Give a quick diagnosis and one or two specific actions to take.',
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Claude API error');
  }

  const data = await response.json();
  const raw = data.content[0].text;
  // Strip markdown formatting so it renders as clean plain text
  return raw
    .replace(/#{1,6}\s+/g, '')           // ## headings
    .replace(/\*\*(.*?)\*\*/g, '$1')     // **bold**
    .replace(/\*(.*?)\*/g, '$1')         // *italic*
    .replace(/`([^`]*)`/g, '$1')         // `code`
    .replace(/^[-*]\s+/gm, '')           // - bullet points
    .replace(/\n{3,}/g, '\n\n')          // collapse extra blank lines
    .trim();
}
