from http.server import BaseHTTPRequestHandler
import json
import requests
import urllib.parse

class Handler(BaseHTTPRequestHandler):
    
    def set_headers(self, status_code=200):
        self.send_response(status_code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-type', 'application/json')
        self.end_headers()
    
    def do_OPTIONS(self):
        self.set_headers(200)
    
    def do_GET(self):
        try:
            query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            url = query_params.get('url', [None])[0]
            
            if not url:
                self.set_headers(400)
                self.wfile.write(json.dumps({
                    "error": "URL parameter is required"
                }).encode())
                return
            
            # Use reliable external API
            api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(url)}"
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.tikwm.com/',
            }
            
            response = requests.get(api_url, headers=headers, timeout=20)
            data = response.json()
            
            if data.get('code') == 0 and data.get('data') and data['data'].get('play'):
                video_url = data['data']['play']
                if not video_url.startswith('http'):
                    video_url = f"https://www.tikwm.com{video_url}"
                
                self.set_headers(200)
                self.wfile.write(json.dumps({
                    "success": True,
                    "data": {
                        "downloadURL": video_url,
                        "title": data['data'].get('title', 'TikTok Video'),
                        "author": data['data'].get('author', {}).get('nickname', 'Unknown'),
                        "duration": data['data'].get('duration'),
                        "cover": data['data'].get('cover'),
                        "originalURL": url
                    }
                }).encode())
            else:
                self.set_headers(404)
                self.wfile.write(json.dumps({
                    "error": "Video not found or unavailable"
                }).encode())
                
        except Exception as e:
            self.set_headers(500)
            self.wfile.write(json.dumps({
                "error": "Failed to download video",
                "message": str(e)
            }).encode())

def handler(request, context):
    return Handler()
