from http.server import BaseHTTPRequestHandler
import json
import requests
import re
import urllib.parse
from bs4 import BeautifulSoup
import time

class Handler(BaseHTTPRequestHandler):
    
    def set_headers(self, status_code=200):
        self.send_response(status_code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-type', 'application/json')
        self.end_headers()
    
    def do_OPTIONS(self):
        self.set_headers(200)
    
    def do_GET(self):
        try:
            # Parse query parameters
            query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            url = query_params.get('url', [None])[0]
            
            if not url:
                self.set_headers(400)
                self.wfile.write(json.dumps({
                    "error": "URL parameter is required",
                    "usage": "/api/download?url=https://vm.tiktok.com/xxxxx"
                }).encode())
                return
            
            # Download TikTok video
            result = self.download_tiktok_video(url)
            
            if result.get('success'):
                self.set_headers(200)
                self.wfile.write(json.dumps(result).encode())
            else:
                self.set_headers(404)
                self.wfile.write(json.dumps(result).encode())
                
        except Exception as e:
            self.set_headers(500)
            self.wfile.write(json.dumps({
                "error": "Internal server error",
                "message": str(e)
            }).encode())
    
    def download_tiktok_video(self, url):
        """
        Main function to download TikTok video using multiple methods
        """
        methods = [
            self.method_direct_scrape,
            self.method_tikwm_api,
            self.method_ssstik,
            self.method_tiklydown
        ]
        
        for method in methods:
            try:
                print(f"Trying method: {method.__name__}")
                result = method(url)
                if result and result.get('success'):
                    print(f"Success with method: {method.__name__}")
                    return result
            except Exception as e:
                print(f"Method {method.__name__} failed: {str(e)}")
                continue
        
        return {
            "success": False,
            "error": "All download methods failed. The video might be private or unavailable."
        }
    
    def method_direct_scrape(self, url):
        """
        Method 1: Direct scraping from TikTok page
        """
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for JSON data in script tags
        scripts = soup.find_all('script')
        for script in scripts:
            if script.string:
                # Method 1A: Look for video URL in JSON
                json_match = re.search(r'"downloadAddr":"([^"]+)"', script.string)
                if json_match:
                    video_url = json_match.group(1).replace('\\u0026', '&')
                    if 'tiktokcdn.com' in video_url:
                        return self._build_success_response(video_url, url, "direct_json")
                
                # Method 1B: Look for playAddr
                play_match = re.search(r'"playAddr":"([^"]+)"', script.string)
                if play_match:
                    video_url = play_match.group(1).replace('\\u0026', '&')
                    if 'tiktokcdn.com' in video_url:
                        return self._build_success_response(video_url, url, "direct_playaddr")
        
        # Method 1C: Look for video in meta tags
        meta_video = soup.find('meta', property='og:video')
        if meta_video and meta_video.get('content'):
            video_url = meta_video['content']
            if 'tiktokcdn.com' in video_url:
                return self._build_success_response(video_url, url, "meta_tags")
        
        return None
    
    def method_tikwm_api(self, url):
        """
        Method 2: Use tikwm.com API (usually reliable)
        """
        api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(url)}"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.tikwm.com/',
        }
        
        response = requests.get(api_url, headers=headers, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get('code') == 0 and data.get('data') and data['data'].get('play'):
            video_url = data['data']['play']
            if not video_url.startswith('http'):
                video_url = f"https://www.tikwm.com{video_url}"
            
            return {
                "success": True,
                "data": {
                    "downloadURL": video_url,
                    "title": data['data'].get('title', 'TikTok Video'),
                    "author": data['data'].get('author', {}).get('nickname', 'Unknown'),
                    "duration": data['data'].get('duration'),
                    "cover": data['data'].get('cover'),
                    "originalURL": url,
                    "method": "tikwm_api"
                }
            }
        
        return None
    
    def method_ssstik(self, url):
        """
        Method 3: Use ssstik.io method
        """
        # First get the page to get tokens
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
        
        # Get the download page
        dl_url = "https://ssstik.io"
        response = requests.get(dl_url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        token_input = soup.find('input', {'name': 'token'})
        
        if token_input:
            token = token_input.get('value')
            
            # Submit the form
            data = {
                'id': url,
                'token': token,
                'locale': 'en'
            }
            
            headers.update({
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://ssstik.io',
                'Referer': 'https://ssstik.io/',
            })
            
            response = requests.post('https://ssstik.io/abc', data=data, headers=headers, timeout=15)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Look for download link
            download_link = soup.find('a', {'download': True})
            if download_link and download_link.get('href'):
                video_url = download_link['href']
                if video_url.startswith('http'):
                    return self._build_success_response(video_url, url, "ssstik")
        
        return None
    
    def method_tiklydown(self, url):
        """
        Method 4: Use tiklydown.eu.org API
        """
        api_url = "https://api.tiklydown.eu.org/api/download"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
        }
        
        data = {
            "url": url
        }
        
        response = requests.post(api_url, json=data, headers=headers, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get('video'):
            video_url = data['video'].get('noWatermark') or data['video'].get('withWatermark')
            if video_url:
                return {
                    "success": True,
                    "data": {
                        "downloadURL": video_url,
                        "title": data.get('title', 'TikTok Video'),
                        "author": data.get('author', {}).get('nickname', data.get('author', 'Unknown')),
                        "music": data.get('music'),
                        "originalURL": url,
                        "method": "tiklydown"
                    }
                }
        
        return None
    
    def _build_success_response(self, video_url, original_url, method):
        """
        Build standardized success response
        """
        return {
            "success": True,
            "data": {
                "downloadURL": video_url,
                "title": "TikTok Video",
                "author": "Unknown",
                "originalURL": original_url,
                "method": method
            }
        }

# Vercel serverless function handler
def handler(request, context):
    return Handler()
