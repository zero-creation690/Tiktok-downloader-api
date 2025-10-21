const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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
    if (!isValidTikTokUrl(url)) {
      return res.status(400).json({ error: 'Invalid TikTok URL' });
    }

    // Try multiple methods
    let videoData = await method1_DirectScrape(url);
    if (!videoData) videoData = await method2_ExternalAPI(url);
    if (!videoData) videoData = await method3_OpenAPI(url);

    if (!videoData) {
      return res.status(404).json({ error: 'Could not extract video from this URL' });
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

// Method 1: Direct scraping with multiple techniques
async function method1_DirectScrape(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Technique 1: Look for JSON data in script tags
    const scripts = $('script');
    for (let i = 0; i < scripts.length; i++) {
      const scriptContent = $(scripts[i]).html();
      if (!scriptContent) continue;

      // Look for video data in various JSON structures
      const patterns = [
        /"downloadAddr":"([^"]+)"/,
        /"playAddr":"([^"]+)"/,
        /"video":{"url":"([^"]+)"/,
        /"urls":\["([^"]+)"\]/,
        /"videoUrl":"([^"]+)"/,
        /"downloadUrl":"([^"]+)"/,
      ];

      for (const pattern of patterns) {
        const match = scriptContent.match(pattern);
        if (match && match[1]) {
          let videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
          
          if (videoUrl && !videoUrl.startsWith('http')) {
            videoUrl = 'https:' + videoUrl;
          }

          if (videoUrl && videoUrl.includes('tiktokcdn')) {
            return {
              downloadURL: videoUrl,
              title: extractTitle(html),
              author: extractAuthor(html),
              originalURL: url,
              method: 'direct_scrape'
            };
          }
        }
      }

      // Try to parse large JSON objects
      try {
        const jsonMatches = scriptContent.match(/\{.*"video".*\}/g);
        if (jsonMatches) {
          for (const jsonStr of jsonMatches) {
            try {
              const data = JSON.parse(jsonStr);
              const videoUrl = findVideoUrlInObject(data);
              if (videoUrl) {
                return {
                  downloadURL: videoUrl,
                  title: extractTitle(html),
                  author: extractAuthor(html),
                  originalURL: url,
                  method: 'json_parse'
                };
              }
            } catch (e) {
              // Continue if JSON parsing fails
            }
          }
        }
      } catch (e) {
        // Continue to next technique
      }
    }

    // Technique 2: Meta tags
    const metaVideo = $('meta[property="og:video"]').attr('content') || 
                     $('meta[property="og:video:url"]').attr('content') ||
                     $('meta[name="twitter:player:stream"]').attr('content');

    if (metaVideo && metaVideo.includes('tiktokcdn')) {
      return {
        downloadURL: metaVideo,
        title: $('meta[property="og:title"]').attr('content') || 'TikTok Video',
        author: extractAuthor(html),
        originalURL: url,
        method: 'meta_tags'
      };
    }

  } catch (error) {
    console.log('Method 1 failed:', error.message);
  }
  return null;
}

// Method 2: Use external API service
async function method2_ExternalAPI(url) {
  try {
    const services = [
      {
        url: 'https://api.tiklydown.eu.org/api/download',
        method: 'post',
        data: { url: url }
      },
      {
        url: `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
        method: 'get'
      }
    ];

    for (const service of services) {
      try {
        const response = service.method === 'post' 
          ? await axios.post(service.url, service.data, {
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 10000
            })
          : await axios.get(service.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 10000
            });

        const data = response.data;
        
        // Parse different response formats
        let videoUrl = null;
        if (data.data && data.data.play) {
          videoUrl = data.data.play;
        } else if (data.video) {
          videoUrl = data.video.noWatermark || data.video.withWatermark;
        } else if (data.play) {
          videoUrl = data.play;
        }

        if (videoUrl) {
          return {
            downloadURL: videoUrl.startsWith('http') ? videoUrl : `https://www.tikwm.com${videoUrl}`,
            title: data.title || 'TikTok Video',
            author: data.author?.nickname || data.author || 'Unknown',
            originalURL: url,
            method: 'external_api'
          };
        }
      } catch (e) {
        console.log(`Service ${service.url} failed:`, e.message);
        continue;
      }
    }
  } catch (error) {
    console.log('Method 2 failed:', error.message);
  }
  return null;
}

// Method 3: Open APIs
async function method3_OpenAPI(url) {
  try {
    const apis = [
      `https://api.tiktokdownloadr.com/video?url=${encodeURIComponent(url)}`,
      `https://tikdown.org/api?url=${encodeURIComponent(url)}`
    ];

    for (const apiUrl of apis) {
      try {
        const response = await axios.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        });

        const data = response.data;
        if (data.video_url || data.download_url) {
          return {
            downloadURL: data.video_url || data.download_url,
            title: data.title || 'TikTok Video',
            author: data.author || 'Unknown',
            originalURL: url,
            method: 'open_api'
          };
        }
      } catch (e) {
        continue;
      }
    }
  } catch (error) {
    console.log('Method 3 failed:', error.message);
  }
  return null;
}

// Helper functions
function findVideoUrlInObject(obj) {
  if (typeof obj !== 'object' || obj === null) return null;
  
  for (let key in obj) {
    if (typeof obj[key] === 'string' && obj[key].includes('tiktokcdn.com') && obj[key].includes('.mp4')) {
      return obj[key].replace(/\\u0026/g, '&');
    }
    if (typeof obj[key] === 'object') {
      const result = findVideoUrlInObject(obj[key]);
      if (result) return result;
    }
  }
  return null;
}

function extractTitle(html) {
  const $ = cheerio.load(html);
  return $('meta[property="og:title"]').attr('content') || 
         $('title').text() || 
         'TikTok Video';
}

function extractAuthor(html) {
  const $ = cheerio.load(html);
  const authorFromMeta = $('meta[property="og:description"]').attr('content');
  if (authorFromMeta && authorFromMeta.includes('@')) {
    const match = authorFromMeta.match(/@([^\s]+)/);
    if (match) return match[1];
  }
  return 'Unknown';
}
