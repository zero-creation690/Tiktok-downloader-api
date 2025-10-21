from http.server import BaseHTTPRequestHandler
import json
import requests
import urllib.parse

def handler(request, context):
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS request
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({})
        }
    
    # Handle GET request
    if request.method == 'GET':
        try:
            # Parse query parameters
            query_params = request.get('queryStringParameters', {}) or {}
            url = query_params.get('url')
            
            if not url:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        "error": "URL parameter is required",
                        "usage": "/api/download?url=https://vm.tiktok.com/xxxxx"
                    })
                }
            
            # Download TikTok video using external API
            result = download_tiktok_video(url)
            
            return {
                'statusCode': 200 if result.get('success') else 404,
                'headers': headers,
                'body': json.dumps(result)
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    "error": "Failed to download video",
                    "message": str(e)
                })
            }
    
    # Method not allowed
    return {
        'statusCode': 405,
        'headers': headers,
        'body': json.dumps({"error": "Method not allowed"})
    }

def download_tiktok_video(url):
    """
    Download TikTok video using multiple external APIs
    """
    methods = [
        method_tikwm_api,
        method_tiklydown,
        method_tikdown
    ]
    
    for method in methods:
        try:
            result = method(url)
            if result and result.get('success'):
                return result
        except Exception as e:
            print(f"Method {method.__name__} failed: {str(e)}")
            continue
    
    return {
        "success": False,
        "error": "All download methods failed"
    }

def method_tikwm_api(url):
    """
    Use tikwm.com API - Most reliable
    """
    api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(url)}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.tikwm.com/',
    }
    
    response = requests.get(api_url, headers=headers, timeout=15)
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

def method_tiklydown(url):
    """
    Use tiklydown API
    """
    api_url = "https://api.tiklydown.eu.org/api/download"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
    }
    
    data = {"url": url}
    
    response = requests.post(api_url, json=data, headers=headers, timeout=15)
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

def method_tikdown(url):
    """
    Use tikdown.org API
    """
    api_url = f"https://tikdown.org/getAjax?url={urllib.parse.quote(url)}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://tikdown.org/',
    }
    
    response = requests.get(api_url, headers=headers, timeout=15)
    data = response.json()
    
    if data.get('medias'):
        # Get the highest quality video
        for media in data['medias']:
            if media.get('video') and media['video'].get('url'):
                return {
                    "success": True,
                    "data": {
                        "downloadURL": media['video']['url'],
                        "title": data.get('title', 'TikTok Video'),
                        "author": data.get('author', 'Unknown'),
                        "originalURL": url,
                        "method": "tikdown"
                    }
                }
    
    return None
