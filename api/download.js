const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      error: 'TikTok URL is required',
      usage: '/api/download?url=https://vm.tiktok.com/xxxxx'
    });
  }

  try {
    // Validate TikTok URL
    if (!isValidTikTokUrl(url)) {
      return res.status(400).json({ error: 'Invalid TikTok URL' });
    }

    const videoData = await getTikTokVideo(url);
    
    if (!videoData || !videoData.downloadURL) {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }

    res.json({
      success: true,
      data: videoData
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch video',
      message: error.message
    });
  }
};

function isValidTikTokUrl(url) {
  const tiktokPatterns = [
    /https?:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
    /https?:\/\/(www\.)?tiktok\.com\/t\/[a-zA-Z0-9]+/,
    /https?:\/\/vm\.tiktok\.com\/[a-zA-Z0-9]+/,
    /https?:\/\/vt\.tiktok\.com\/[a-zA-Z0-9]+/
  ];
  
  return tiktokPatterns.some(pattern => pattern.test(url));
}

async function getTikTokVideo(url) {
  try {
    // First, try to get the video data from the page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    // Look for video URL in various possible locations
    let videoUrl = null;
    let title = 'TikTok Video';
    let author = 'Unknown';

    // Method 1: Look for JSON data in script tags
    const scriptTags = $('script');
    for (let i = 0; i < scriptTags.length; i++) {
      const scriptContent = $(scriptTags[i]).html();
      if (scriptContent && scriptContent.includes('videoData')) {
        try {
          // Extract JSON data
          const jsonMatch = scriptContent.match(/\{"props":\s*\{[^}]+\}\}/);
          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[0]);
            if (jsonData.props?.pageProps?.videoData?.itemInfos) {
              const videoData = jsonData.props.pageProps.videoData.itemInfos;
              videoUrl = videoData.video?.urls?.[0];
              title = videoData.text || 'TikTok Video';
              author = videoData.author?.uniqueId || 'Unknown';
              break;
            }
          }
        } catch (e) {
          console.log('JSON parsing failed, trying other methods');
        }
      }
    }

    // Method 2: Look for video URL in meta tags
    if (!videoUrl) {
      $('meta').each((i, meta) => {
        const property = $(meta).attr('property');
        const content = $(meta).attr('content');
        
        if (property === 'og:video' || property === 'og:video:url') {
          videoUrl = content;
        }
        if (property === 'og:title') {
          title = content;
        }
        if (property === 'og:description' && content.includes('@')) {
          author = content.split('@')[1]?.split(' ')[0] || 'Unknown';
        }
      });
    }

    // Method 3: Look for video URL in the page source
    if (!videoUrl) {
      const html = response.data;
      const videoRegex = /"downloadAddr":"([^"]+)"/;
      const match = html.match(videoRegex);
      if (match) {
        videoUrl = match[1].replace(/\\u0026/g, '&');
      }
    }

    if (videoUrl) {
      // Ensure the URL is absolute
      if (videoUrl.startsWith('//')) {
        videoUrl = 'https:' + videoUrl;
      } else if (videoUrl.startsWith('/')) {
        videoUrl = 'https://www.tiktok.com' + videoUrl;
      }

      return {
        downloadURL: videoUrl,
        title: title,
        author: author,
        originalURL: url
      };
    }

    throw new Error('Could not extract video URL');

  } catch (error) {
    console.error('Error in getTikTokVideo:', error.message);
    throw error;
  }
}
