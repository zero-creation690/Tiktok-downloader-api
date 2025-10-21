const axios = require('axios');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Using external service as fallback
    const response = await axios.post('https://api.tiklydown.eu.org/api/download', {
      url: url
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const data = response.data;
    
    if (data && data.video) {
      res.json({
        success: true,
        author: data.author?.nickname || 'Unknown',
        title: data.title || 'TikTok Video',
        downloadUrl: data.video.noWatermark || data.video.withWatermark,
        music: data.music || null
      });
    } else {
      res.status(404).json({ error: 'Video not found' });
    }

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to download video',
      message: error.message 
    });
  }
}
